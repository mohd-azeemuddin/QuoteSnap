/**
 * Shorten customer quote links (e.g. https://is.gd/a8Kq2) so WhatsApp messages stay clean.
 * Only links to this app's own host are accepted, so the endpoint can't be used as an open shortener.
 * If every shortener fails, callers keep the original link.
 */
const SHORTENERS: Array<(url: string) => string> = [
  (url) => `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
  (url) => `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
];

export function isOwnQuoteLink(url: string, host: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.host === host && (u.searchParams.has('q') || u.searchParams.has('quote'));
  } catch {
    return false;
  }
}

export async function shortenUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  for (const build of SHORTENERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetchImpl(build(url), { signal: controller.signal });
      const text = (await resp.text()).trim();
      if (resp.ok && /^https:\/\/\S+$/.test(text) && text.length < 60) return text;
      console.error('[shorten] unexpected reply:', resp.status, text.slice(0, 120));
    } catch (err) {
      console.error('[shorten] failed:', err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
