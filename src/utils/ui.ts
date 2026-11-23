import type { SavedQuote, BusinessProfile } from '../types.ts';
import { encodeShareableQuote, formatINR, formatINRCompact } from './quoteMath.ts';

export const DAY_MS = 864e5;

export function fmtDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtShort(iso: string | number): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export const rupees = (n: number) => formatINR(n, false);
export const shortName = (name: string) => name.split('(')[0].trim();
export const firstName = (name: string) => (name || '').split(/[\s(]/)[0];

export const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '36': 'Telangana', '37': 'Andhra Pradesh',
};

/** Read a Blob as base64 (without the data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const i = result.indexOf(',');
      if (i === -1) reject(new Error('Could not read the file.'));
      else resolve(result.slice(i + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Shrink a photo before upload: max 1600px on the long side, JPEG ~0.82.
 * A 4 MB phone photo becomes ~300 KB, which uploads fast on mobile data
 * and stays far below serverless body limits.
 */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export function normalizeAudioMime(raw: string, fileName = ''): string {
  const clean = raw.split(';')[0].trim().toLowerCase();
  if (clean && clean !== 'application/octet-stream') return clean;
  const f = fileName.toLowerCase();
  if (f.endsWith('.mp3')) return 'audio/mpeg';
  if (f.endsWith('.wav')) return 'audio/wav';
  if (f.endsWith('.m4a')) return 'audio/mp4';
  if (f.endsWith('.ogg') || f.endsWith('.opus')) return 'audio/ogg';
  return 'audio/webm';
}

export function base64ToBlobUrl(base64: string, mime: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function shareUrl(quote: SavedQuote): string {
  return `${window.location.origin}${window.location.pathname}?quote=${encodeShareableQuote(quote)}`;
}

export function advanceOf(quote: SavedQuote): { pct: number; amount: number } {
  const pct = quote.businessSnapshot.advancePercent ?? 50;
  return { pct, amount: Math.round((quote.totals.grandTotal * pct) / 100) };
}

export function upiLink(quote: SavedQuote): string | null {
  const upi = quote.businessSnapshot.upiId;
  if (!upi) return null;
  const { amount } = advanceOf(quote);
  const params = new URLSearchParams({
    pa: upi,
    pn: quote.businessSnapshot.businessName,
    am: String(amount),
    cu: 'INR',
    tn: `Advance ${quote.quoteNumber}`,
  });
  return `upi://pay?${params.toString()}`;
}

export function waLink(phone: string, text: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** The WhatsApp message sent with a quote. Short enough to read on a phone. */
export function quoteMessage(quote: SavedQuote, tone: 'english' | 'hinglish', link: string): string {
  const opener = (tone === 'hinglish' ? quote.whatsappFollowUpHinglish : quote.whatsappFollowUpEn).trim();
  const items = quote.lines
    .map((l) => `• ${shortName(l.name)}: ${l.quantity} ${l.unit}, ${formatINRCompact(l.lineTotal)}`)
    .join('\n');
  const valid = fmtShort(quote.validUntil);
  const total = rupees(quote.totals.grandTotal);
  const biz = quote.businessSnapshot.businessName;
  if (tone === 'hinglish') {
    return [
      opener || `Namaste${quote.customerName ? ` ${firstName(quote.customerName)} ji` : ''}! Aapka quote ready hai.`,
      '',
      `*${biz}*, quote ${quote.quoteNumber}`,
      items,
      '',
      `*Total (GST ke saath): ${total}*`,
      `${valid} tak valid hai.`,
      '',
      `Quote dekhein, approve karein aur advance pay karein:`,
      link,
    ].join('\n');
  }
  return [
    opener || `Hi${quote.customerName ? ` ${firstName(quote.customerName)}` : ''}, here is your quote.`,
    '',
    `*${biz}*, quote ${quote.quoteNumber}`,
    items,
    '',
    `*Total incl. GST: ${total}*`,
    `Valid till ${valid}.`,
    '',
    `View, approve and pay the advance here:`,
    link,
  ].join('\n');
}

export function reminderMessage(quote: SavedQuote, link: string): string {
  const name = firstName(quote.customerName);
  return `Hi${name ? ` ${name}` : ''}, just checking if you had a chance to look at quote ${quote.quoteNumber} (${rupees(
    quote.totals.grandTotal
  )}). Happy to adjust anything or visit the site. It's valid till ${fmtShort(quote.validUntil)}.\n\n${link}\n${
    quote.businessSnapshot.businessName
  }`;
}

export function snapshotExtras(business: BusinessProfile) {
  return { advancePercent: business.advancePercent ?? 50 };
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
