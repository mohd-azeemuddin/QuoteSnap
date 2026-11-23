import { useRef, useState } from 'react';
import type { BusinessProfile, CatalogItem } from '../types.ts';
import { exportRateCardCsv, getSampleRateCardCsv, isValidGSTIN, parseRateCardCsv } from '../utils/quoteMath.ts';
import { STATE_CODES } from '../utils/ui.ts';
import { copyText, useToast } from './Dialog.tsx';
import { Icon } from './Icon.tsx';

export function GstinField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const v = value.trim().toUpperCase();
  const valid = v.length === 0 || isValidGSTIN(v);
  const msg = !v
    ? ''
    : valid
      ? `Valid format. Registered in ${STATE_CODES[v.slice(0, 2)] ?? `state ${v.slice(0, 2)}`}.`
      : v.length < 15
        ? `${15 - v.length} more character${15 - v.length === 1 ? '' : 's'} needed.`
        : "This doesn't look like a GSTIN. Check it against your registration certificate.";
  return (
    <div className="field">
      <label htmlFor={id}>GSTIN</label>
      <input
        id={id}
        value={value}
        maxLength={15}
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={!valid}
        aria-describedby={`${id}-msg`}
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
      />
      <span id={`${id}-msg`} className={valid ? 'ok' : 'err'} aria-live="polite">{msg}</span>
    </div>
  );
}

export function RateCardView({ business, onChange }: { business: BusinessProfile; onChange: (b: BusinessProfile) => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const setItem = (i: number, patch: Partial<CatalogItem>) =>
    onChange({ ...business, items: business.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const addItem = () =>
    onChange({
      ...business,
      items: [...business.items, { id: `custom-${Date.now()}`, name: 'New item', unit: 'unit', unitPrice: 0, gstPercent: 18, keywords: [], hsnSac: '' }],
    });

  const importCsv = async (file: File) => {
    setImportError(null);
    try {
      const items = parseRateCardCsv(await file.text());
      if (!items.length) throw new Error('No items found');
      onChange({ ...business, items });
      toast(`Imported ${items.length} items`);
    } catch {
      setImportError('That file could not be read. Download the template, fill it in, and import it again.');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Rate card</h1>
          <p className="hint">These are the only prices QuoteSnap uses. Changes apply to new quotes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])} />
          <button type="button" className="btn" onClick={async () => toast((await copyText(exportRateCardCsv(business.items))) ? 'Rate card copied as CSV' : 'Copy failed')}>
            <Icon name="copy" />
            Copy as CSV
          </button>
          <button type="button" className="btn" onClick={async () => toast((await copyText(getSampleRateCardCsv())) ? 'CSV template copied' : 'Copy failed')}>
            Copy template
          </button>
          <button type="button" className="btn btn-primary" onClick={addItem}>
            <Icon name="plus" />
            Add item
          </button>
        </div>
      </div>
      {importError && (
        <div className="alert alert-bad" role="alert" style={{ marginBottom: 14 }}>
          <Icon name="warn" />
          <div>{importError}</div>
        </div>
      )}
      <div className="rc-grid">
        <section className="card table-wrap" aria-label="Items and prices">
          <table className="qtable rc-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Unit</th>
                <th scope="col" className="r">Price (₹)</th>
                <th scope="col">GST</th>
                <th scope="col">HSN/SAC</th>
                <th scope="col"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {business.items.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ minWidth: 240 }}>
                    <input aria-label={`Item ${i + 1} name`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                    <input
                      aria-label={`Words customers use for ${it.name}`}
                      placeholder="Words customers use, comma separated"
                      value={it.keywords.join(', ')}
                      onChange={(e) => setItem(i, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                      style={{ fontSize: 13, color: 'var(--muted)' }}
                    />
                  </td>
                  <td style={{ width: 96 }}>
                    <input aria-label={`Unit for ${it.name}`} value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                  </td>
                  <td style={{ width: 120 }}>
                    <input className="price" aria-label={`Price for ${it.name}`} inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td style={{ width: 96 }}>
                    <select aria-label={`GST rate for ${it.name}`} value={it.gstPercent} onChange={(e) => setItem(i, { gstPercent: Number(e.target.value) })}>
                      {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </td>
                  <td style={{ width: 110 }}>
                    <input aria-label={`HSN or SAC code for ${it.name}`} value={it.hsnSac ?? ''} onChange={(e) => setItem(i, { hsnSac: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`Delete ${it.name}`} onClick={() => onChange({ ...business, items: business.items.filter((_, idx) => idx !== i) })}>
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
              {business.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>
                    No items yet. Add your first item or import a CSV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card" aria-labelledby="biz-title">
          <div className="card-h"><h2 id="biz-title">Business details</h2></div>
          <div className="card-b stack">
            <div className="field">
              <label htmlFor="b-name">Business name</label>
              <input id="b-name" value={business.businessName} onChange={(e) => onChange({ ...business, businessName: e.target.value })} />
            </div>
            <GstinField id="b-gstin" value={business.gstin} onChange={(gstin) => onChange({ ...business, gstin })} />
            <div className="field">
              <label htmlFor="b-phone">WhatsApp number</label>
              <input id="b-phone" inputMode="tel" value={business.phone} onChange={(e) => onChange({ ...business, phone: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="b-addr">Address</label>
              <input id="b-addr" value={business.address} onChange={(e) => onChange({ ...business, address: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="b-upi">UPI ID for advance payments</label>
              <input id="b-upi" value={business.upiId ?? ''} placeholder="yourname@okbank" onChange={(e) => onChange({ ...business, upiId: e.target.value.trim() })} />
            </div>
            <div className="field">
              <label htmlFor="b-adv">Advance on approval</label>
              <select id="b-adv" value={business.advancePercent ?? 50} onChange={(e) => onChange({ ...business, advancePercent: Number(e.target.value) })}>
                {[0, 20, 25, 30, 40, 50, 100].map((a) => <option key={a} value={a}>{a}%</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="b-terms">Terms printed on every quote</label>
              <textarea id="b-terms" rows={3} value={business.termsNote ?? ''} onChange={(e) => onChange({ ...business, termsNote: e.target.value })} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
