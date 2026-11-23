import { useState } from 'react';
import type { QuoteStatus, SavedQuote } from '../types.ts';
import { formatINR } from '../utils/quoteMath.ts';
import { DAY_MS, fmtShort } from '../utils/ui.ts';
import { Icon } from './Icon.tsx';

const STATUSES: QuoteStatus[] = ['Draft', 'Sent', 'Won', 'Lost'];

export function QuotesView({
  quotes,
  businessName,
  onOpen,
  onStatus,
  onRemind,
  onDelete,
}: {
  quotes: SavedQuote[];
  businessName: string;
  onOpen: (q: SavedQuote) => void;
  onStatus: (q: SavedQuote, s: QuoteStatus) => void;
  onRemind: (q: SavedQuote) => void;
  onDelete: (q: SavedQuote) => void;
}) {
  const [filter, setFilter] = useState<'All' | QuoteStatus>('All');
  const by = (s: QuoteStatus) => quotes.filter((q) => q.status === s);
  const sum = (list: SavedQuote[]) => list.reduce((a, q) => a + q.totals.grandTotal, 0);
  const open = [...by('Draft'), ...by('Sent')];
  const won = by('Won');
  const decided = won.length + by('Lost').length;
  const rate = decided ? Math.round((won.length / decided) * 100) : null;
  const minsSaved = quotes.reduce((a, q) => a + Math.max(0, (q.manualBaselineMins ?? 20) - (q.processingTimeMs || 0) / 60000), 0);
  const list = filter === 'All' ? quotes : by(filter);
  const n = quotes.length || 1;
  const colors: Record<QuoteStatus, string> = { Draft: 'var(--line)', Sent: 'var(--peacock)', Won: 'var(--ok)', Lost: 'var(--bad)' };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quotes</h1>
          <p className="hint">{businessName}</p>
        </div>
        <a className="btn btn-primary" href="#new-quote">
          <Icon name="spark" />
          New quote
        </a>
      </div>

      {quotes.length === 0 ? (
        <div className="card empty">
          <h2>No quotes yet</h2>
          <p>Your quotes appear here with their status, so you can see what's waiting on a reply.</p>
          <a className="btn btn-primary" href="#new-quote">Make your first quote</a>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span>Open quotes</span>
              <b className="num">{formatINR(sum(open), false)}</b>
              <small>{open.length} waiting to be sent or answered</small>
            </div>
            <div className="kpi">
              <span>Won</span>
              <b className="num" style={{ color: 'var(--ok)' }}>{formatINR(sum(won), false)}</b>
              <small>{won.length} job{won.length === 1 ? '' : 's'}{rate !== null ? `, ${rate}% win rate` : ''}</small>
            </div>
            <div className="kpi">
              <span>Time saved</span>
              <b className="num">{(minsSaved / 60).toFixed(1)} hrs</b>
              <small>vs about 20 minutes per quote by hand</small>
            </div>
          </div>

          <div className="card card-b" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <b>Pipeline</b>
              <span className="hint">{quotes.length} quote{quotes.length === 1 ? '' : 's'}</span>
            </div>
            <div className="funnel" role="img" aria-label={STATUSES.map((s) => `${by(s).length} ${s.toLowerCase()}`).join(', ')}>
              {STATUSES.map((s) => (
                <i key={s} style={{ width: `${(by(s).length / n) * 100}%`, background: colors[s] }} />
              ))}
            </div>
            <div className="legend" aria-hidden="true">
              {STATUSES.map((s) => (
                <span key={s}><b style={{ background: colors[s] }} />{s} {by(s).length}</span>
              ))}
            </div>
          </div>

          <div className="toolbar">
            <div className="seg" role="group" aria-label="Show quotes">
              {(['All', ...STATUSES] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
            <span className="hint">Quotes with no reply for 2 days get a reminder button.</span>
          </div>

          <div className="card table-wrap">
            <table className="qtable">
              <caption className="sr-only">Your quotes</caption>
              <thead>
                <tr>
                  <th scope="col">Quote</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="r">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((q) => {
                  const age = Math.floor((Date.now() - new Date(q.sentAt ?? q.createdAt).getTime()) / DAY_MS);
                  const stale = q.status === 'Sent' && age >= 2;
                  return (
                    <tr key={q.id}>
                      <td>
                        <b className="num">{q.quoteNumber}</b>
                        <div className="sub">{fmtShort(q.createdAt)}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{q.customerName || 'Customer'}</div>
                        <div className="sub">{q.customerLocation}</div>
                      </td>
                      <td className="r num">{formatINR(q.totals.grandTotal, false)}</td>
                      <td>
                        <label className="sr-only" htmlFor={`st-${q.id}`}>Status of {q.quoteNumber}</label>
                        <select id={`st-${q.id}`} className={`st-select pill-${q.status.toLowerCase()}`} value={q.status} onChange={(e) => onStatus(q, e.target.value as QuoteStatus)}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {stale && <div className="nudge"><Icon name="bell" className="icon" />No reply for {age} days</div>}
                      </td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {stale && (
                          <button type="button" className="btn btn-sm" onClick={() => onRemind(q)}>Send reminder</button>
                        )}{' '}
                        <button type="button" className="btn btn-sm" onClick={() => onOpen(q)}>Open</button>{' '}
                        <button type="button" className="icon-btn" aria-label={`Delete ${q.quoteNumber}`} onClick={() => onDelete(q)}>
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40 }} className="muted">No {filter.toLowerCase()} quotes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
