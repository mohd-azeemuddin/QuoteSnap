import { useState } from 'react';
import type { SavedQuote } from '../types.ts';
import { formatINR, formatINRCompact } from '../utils/quoteMath.ts';
import { advanceOf, fmtShort, shortName, upiLink, waLink } from '../utils/ui.ts';
import { DocDialog } from './QuoteDialogs.tsx';
import { copyText, useToast } from './Dialog.tsx';
import { Icon } from './Icon.tsx';

/** What the customer sees when they open the link from WhatsApp. No login, works in any phone browser. */
export function CustomerView({ quote, preview = false, onExit }: { quote: SavedQuote; preview?: boolean; onExit?: () => void }) {
  const toast = useToast();
  const [showDoc, setShowDoc] = useState(false);
  const [approved, setApproved] = useState(false);
  const b = quote.businessSnapshot;
  const adv = advanceOf(quote);
  const upi = upiLink(quote);
  const tax = quote.totals.totalCgst + quote.totals.totalSgst + quote.totals.totalIgst;
  const approveText = `Hi ${b.businessName}, I approve quote ${quote.quoteNumber} for ${formatINR(quote.totals.grandTotal, false)}. Please go ahead.`;
  const askText = `Hi ${b.businessName}, I have a question about quote ${quote.quoteNumber}.`;

  return (
    <div className="cv">
      {preview && (
        <div className="alert alert-demo" style={{ margin: '12px 14px' }}>
          <Icon name="info" />
          <div>
            This is what your customer sees when they open the link.{' '}
            {onExit && <button type="button" className="btn btn-sm" onClick={onExit}>Back to the quote</button>}
          </div>
        </div>
      )}
      <header className="cv-head">
        <small>Quotation from</small>
        <h1>{b.businessName}</h1>
        {b.gstin && <small>GSTIN {b.gstin}</small>}
      </header>
      <main id="main" className="cv-amt">
        <span className="hint">For {quote.customerName || 'you'}{quote.customerLocation ? `, ${quote.customerLocation}` : ''}</span>
        <span className="num">{formatINR(quote.totals.grandTotal, false)}</span>
        <span className="hint">Including GST of {formatINR(tax, false)}. Valid till {fmtShort(quote.validUntil)}.</span>
      </main>
      <section className="cv-body" aria-label="Items">
        {quote.lines.map((l) => (
          <div className="cv-item" key={l.id}>
            <div>
              {shortName(l.name)}
              <small>{l.quantity} {l.unit} × {formatINRCompact(l.unitPrice)} + {l.gstPercent}% GST</small>
            </div>
            <b className="num">{formatINR(l.lineTotal, false)}</b>
          </div>
        ))}
        {b.termsNote && <p className="hint" style={{ padding: '4px 4px 0' }}>{b.termsNote}</p>}
        <button type="button" className="btn" onClick={() => setShowDoc(true)}>
          <Icon name="doc" />
          View full quotation (PDF)
        </button>
      </section>

      <div className="cv-actions">
        <div className="in">
          {!approved ? (
            <>
              <a className="btn btn-primary btn-lg" href={waLink(b.phone, approveText)} target="_blank" rel="noopener noreferrer" onClick={() => setApproved(true)}>
                <Icon name="check" />
                Approve quote
              </a>
              <a className="btn" href={waLink(b.phone, askText)} target="_blank" rel="noopener noreferrer">
                <Icon name="wa" />
                Ask a question
              </a>
            </>
          ) : (
            <>
              <div className="alert alert-ok" role="status">
                <Icon name="check" />
                <div>Approval sent to {b.businessName} on WhatsApp.</div>
              </div>
              {upi && adv.amount > 0 && (
                <>
                  <a className="btn btn-primary btn-lg" href={upi}>
                    Pay {adv.pct}% advance, {formatINR(adv.amount, false)}
                  </a>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={async () => toast((await copyText(b.upiId!)) ? 'UPI ID copied' : 'Copy failed')}>
                    On a computer? Copy UPI ID {b.upiId}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {showDoc && <DocDialog quote={quote} onClose={() => setShowDoc(false)} />}
    </div>
  );
}
