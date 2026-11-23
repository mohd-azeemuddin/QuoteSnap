import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SavedQuote } from '../types.ts';
import { formatINR, formatINRInWords } from '../utils/quoteMath.ts';
import { advanceOf, fmtDate, quoteMessage, reminderMessage, shareUrl, waLink } from '../utils/ui.ts';
import { Dialog, copyText, useToast } from './Dialog.tsx';
import { Icon } from './Icon.tsx';

/* ---------------- printable quotation ---------------- */
export function QuoteDocument({ quote }: { quote: SavedQuote }) {
  const b = quote.businessSnapshot;
  const t = quote.totals;
  const adv = advanceOf(quote);
  return (
    <article className="doc" aria-label={`Quotation ${quote.quoteNumber}`}>
      <div className="d-top">
        <div className="d-biz">
          <b>{b.businessName}</b>
          {b.address}
          <br />
          {b.gstin && <>GSTIN {b.gstin}, </>}
          {b.phone}
        </div>
        <div className="d-title">
          <h2>Quotation</h2>
          <div>{quote.quoteNumber}</div>
          <div>Date {fmtDate(quote.createdAt)}</div>
          <div>Valid till {fmtDate(quote.validUntil)}</div>
        </div>
      </div>
      <div className="grid2">
        <div>
          <div className="lbl">Quotation for</div>
          <b>{quote.customerName || 'Customer'}</b>
          {quote.customerLocation && <><br />{quote.customerLocation}</>}
          {quote.customerPhone && <><br />{quote.customerPhone}</>}
        </div>
        <div>
          <div className="lbl">Place of supply</div>
          {quote.placeOfSupply} {quote.supplyType === 'inter' ? '(IGST)' : '(CGST + SGST)'}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Item</th>
              <th scope="col">HSN/SAC</th>
              <th scope="col" className="r">Qty</th>
              <th scope="col" className="r">Rate</th>
              <th scope="col" className="r">Taxable</th>
              <th scope="col" className="r">GST</th>
              <th scope="col" className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>
                  {l.name}
                  {l.dimensionsNote && <><br /><span style={{ color: '#5a6378', fontSize: 11 }}>{l.dimensionsNote}</span></>}
                </td>
                <td>{l.hsnSac || '—'}</td>
                <td className="r">{l.quantity} {l.unit}</td>
                <td className="r">{formatINR(l.unitPrice)}</td>
                <td className="r">{formatINR(l.discountedTaxable)}</td>
                <td className="r">{l.gstPercent}%</td>
                <td className="r">{formatINR(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="d-tot">
        <div>
          <div className="lbl">Amount in words</div>
          <b>{formatINRInWords(t.grandTotal)}</b>
          {b.upiId && (
            <div className="pay">
              <b>{adv.pct}% advance: {formatINR(adv.amount, false)}</b>
              <br />
              Pay by UPI to <b>{b.upiId}</b> from any UPI app.
            </div>
          )}
          {b.termsNote && (
            <div style={{ marginTop: 12 }}>
              <div className="lbl">Terms</div>
              {b.termsNote}
            </div>
          )}
        </div>
        <div>
          <div className="r2"><span>Subtotal</span><span>{formatINR(t.grossSubtotal)}</span></div>
          {t.discountAmount > 0 && <div className="r2"><span>Discount ({quote.discountPercent}%)</span><span>− {formatINR(t.discountAmount)}</span></div>}
          {quote.supplyType === 'inter' ? (
            <div className="r2"><span>IGST</span><span>{formatINR(t.totalIgst)}</span></div>
          ) : (
            <>
              <div className="r2"><span>CGST</span><span>{formatINR(t.totalCgst)}</span></div>
              <div className="r2"><span>SGST</span><span>{formatINR(t.totalSgst)}</span></div>
            </>
          )}
          <div className="r2"><span>Round off</span><span>{formatINR(t.roundOff)}</span></div>
          <div className="r2 g"><span>Total</span><span>{formatINR(t.grandTotal, false)}</span></div>
        </div>
      </div>
      <div className="sign">
        <div>This is a quotation, not a tax invoice.</div>
        <div>
          For {b.businessName}
          <br />
          <br />
          Authorised signatory
        </div>
      </div>
    </article>
  );
}

export function DocDialog({ quote, onClose, onSend }: { quote: SavedQuote; onClose: () => void; onSend?: () => void }) {
  return (
    <>
      <Dialog
        title={quote.quoteNumber}
        onClose={onClose}
        wide
        footer={
          <>
            <span className="hint" style={{ marginRight: 'auto' }}>One A4 page. Choose “Save as PDF” in the print window.</span>
            <button type="button" className="btn" onClick={() => window.print()}>
              <Icon name="print" />
              Download PDF
            </button>
            {onSend && (
              <button type="button" className="btn btn-wa" onClick={onSend}>
                <Icon name="wa" />
                Send
              </button>
            )}
          </>
        }
      >
        <QuoteDocument quote={quote} />
      </Dialog>
      {createPortal(
        <div className="print-root">
          <QuoteDocument quote={quote} />
        </div>,
        document.body
      )}
    </>
  );
}

/* ---------------- send on WhatsApp ---------------- */
export function SendDialog({ quote, onClose, onSent }: { quote: SavedQuote; onClose: () => void; onSent: (q: SavedQuote) => void }) {
  const toast = useToast();
  const [tone, setTone] = useState<'english' | 'hinglish'>(quote.activeTone ?? 'english');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    let alive = true;
    shareUrl(quote).then((l) => {
      if (!alive) return;
      setLink(l);
      setText(quoteMessage(quote, tone, l));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);
  const switchTone = (t: 'english' | 'hinglish') => {
    setTone(t);
    if (link) setText(quoteMessage(quote, t, link));
  };
  const hasPhone = quote.customerPhone.replace(/\D/g, '').length >= 10;
  const markSent = () => {
    if (quote.status === 'Draft') onSent({ ...quote, status: 'Sent', sentAt: new Date().toISOString(), activeTone: tone });
    toast(`Opened WhatsApp for ${quote.quoteNumber}`);
    onClose();
  };
  return (
    <Dialog
      title="Send on WhatsApp"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={async () => toast((await copyText(text)) ? 'Message copied' : 'Copy failed. Select the text and copy it.')}
          >
            <Icon name="copy" />
            Copy message
          </button>
          {text ? (
            <a className="btn btn-wa" href={waLink(quote.customerPhone, text)} target="_blank" rel="noopener noreferrer" onClick={markSent}>
              <Icon name="wa" />
              Open WhatsApp
            </a>
          ) : (
            <button type="button" className="btn btn-wa" disabled>
              <Icon name="loader" className="icon spin" />
              Preparing link…
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p className="hint">
            To {quote.customerName || 'customer'}
            {hasPhone ? `, ${quote.customerPhone}` : '. No number yet, so WhatsApp will ask you to pick a chat.'}
          </p>
          <div className="seg" role="group" aria-label="Message language">
            <button type="button" aria-pressed={tone === 'english'} onClick={() => switchTone('english')}>English</button>
            <button type="button" aria-pressed={tone === 'hinglish'} onClick={() => switchTone('hinglish')}>Hinglish</button>
          </div>
        </div>
        <div className="wa-preview">
          <label htmlFor="wa-text" className="sr-only">Message to send</label>
          <textarea id="wa-text" value={text} placeholder="Preparing your message and a short link…" aria-busy={!text} onChange={(e) => setText(e.target.value)} />
        </div>
        <p className="hint">The link opens the quote in any phone browser, where your customer can approve it and pay the advance.</p>
      </div>
    </Dialog>
  );
}

export function ReminderDialog({ quote, onClose }: { quote: SavedQuote; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  useEffect(() => {
    shareUrl(quote).then((l) => setText(reminderMessage(quote, l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);
  return (
    <Dialog
      title="Send a friendly reminder"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={async () => toast((await copyText(text)) ? 'Reminder copied' : 'Copy failed')}>
            <Icon name="copy" />
            Copy message
          </button>
          <a className="btn btn-wa" href={waLink(quote.customerPhone, text)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            <Icon name="wa" />
            Open WhatsApp
          </a>
        </>
      }
    >
      <div className="wa-preview">
        <label htmlFor="rem-text" className="sr-only">Reminder message</label>
        <textarea id="rem-text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
    </Dialog>
  );
}
