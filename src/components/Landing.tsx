import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESET_BUSINESSES } from '../data/presets.ts';
import { formatINR, formatINRCompact } from '../utils/quoteMath.ts';
import { shortName } from '../utils/ui.ts';
import sampleNoteUrl from '../assets/images/sample_handwritten_note_1794568290874.jpg';
import { Icon, Logo, Wave } from './Icon.tsx';

const interiors = PRESET_BUSINESSES[0];
const DEMO_ROWS = [
  { id: 'int-wardrobe-lam', qty: 56, note: '8 ft × 7 ft = 56 sq ft' },
  { id: 'int-kitchen-loft', qty: 25, note: 'approx 25 sq ft' },
  { id: 'int-false-ceiling', qty: 180, note: 'Hall, 180 sq ft' },
].map((r) => {
  const item = interiors.items.find((i) => i.id === r.id)!;
  return {
    name: shortName(item.name),
    note: `${r.note}, ${formatINR(item.unitPrice, false)}/${item.unit}`,
    amount: Math.round(r.qty * item.unitPrice * (1 + item.gstPercent / 100)),
  };
});
const DEMO_TOTAL = DEMO_ROWS.reduce((a, r) => a + r.amount, 0);

function useReducedMotion() {
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return reduced;
}

function SnapDemo() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? DEMO_ROWS.length : 0);
  const [total, setTotal] = useState(reduced ? DEMO_TOTAL : 0);
  const timers = useRef<number[]>([]);

  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reduced) {
      setStep(DEMO_ROWS.length);
      setTotal(DEMO_TOTAL);
      return;
    }
    setStep(0);
    setTotal(0);
    let running = 0;
    DEMO_ROWS.forEach((row, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i + 1);
          const from = running;
          running += row.amount;
          const to = running;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / 500);
            setTotal(Math.round(from + (to - from) * p));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, 500 + i * 1000)
      );
    });
  }, [reduced]);

  useEffect(() => {
    run();
    return () => timers.current.forEach(clearTimeout);
  }, [run]);

  const marks = [
    'wardrobe chahiye 8x7 ft laminate',
    'kitchen loft approx 25 sqft',
    'false ceiling hall ka 180 sqft',
  ];

  return (
    <figure className="snap" aria-label="Example: a WhatsApp message becomes a GST quote" style={{ margin: 0 }}>
      <button type="button" className="btn btn-sm replay" onClick={run}>
        <Icon name="replay" />
        Replay
      </button>
      <div className="chat">
        <div className="chat-head">
          <span className="avatar" aria-hidden="true">R</span>Ramesh, Whitefield
        </div>
        <p className="bubble">
          Bhaiya 2BHK whitefield mein <mark className={step > 0 ? 'on' : ''}>{marks[0]}</mark>, plus{' '}
          <mark className={step > 1 ? 'on' : ''}>{marks[1]}</mark>, aur{' '}
          <mark className={step > 2 ? 'on' : ''}>{marks[2]}</mark>. Urgent quote bhejo GST ke sath - Ramesh
          <time>10:42</time>
        </p>
      </div>
      <div className="snap-arrow">Read by AI, priced from your rate card</div>
      <div className="mini-quote">
        <div className="mq-head">
          <b>QS-INT-2611-0107</b>
          <span>Namma Interiors</span>
        </div>
        {DEMO_ROWS.slice(0, step).map((r) => (
          <div className="mq-row enter" key={r.name}>
            <div>
              {r.name}
              <small>{r.note}</small>
            </div>
            <b className="num">{formatINR(r.amount, false)}</b>
          </div>
        ))}
        <div className="mq-total">
          <span>Total incl. 18% GST</span>
          <span className="num" aria-live="off">{formatINR(total, false)}</span>
        </div>
      </div>
      <figcaption className="sr-only">
        The message asks for a laminate wardrobe, a kitchen loft and a false ceiling. QuoteSnap turns it into three quote lines
        totalling {formatINR(DEMO_TOTAL, false)} including GST.
      </figcaption>
    </figure>
  );
}

export function Landing({ onStart, onTry }: { onStart: () => void; onTry: (businessId: string) => void }) {
  return (
    <div>
      <div className="wrap">
        <header className="site-nav">
          <a className="brand" href="#home" aria-label="QuoteSnap home">
            <Logo />
            QuoteSnap
          </a>
          <nav className="site-links" aria-label="Page sections">
            <a href="#how">How it works</a>
            <a href="#trust">GST accuracy</a>
            <a href="#trades">Trades</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="btn btn-ink" href="#new-quote">
            Open app
          </a>
        </header>
      </div>

      <main id="main">
        <section className="wrap hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">WhatsApp inquiry in. GST quote out. In 30 seconds.</h1>
            <p className="lede">
              Paste a message, snap a site note or forward a voice note. QuoteSnap prices it from your rate card, gets the GST
              right, and writes the WhatsApp reply for you.
            </p>
            <div className="hero-ctas">
              <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
                Make your first quote free
              </button>
              <a className="btn btn-lg" href="#how">
                See how it works
              </a>
            </div>
            <ul className="hero-note">
              <li><Icon name="check" />No signup to try</li>
              <li><Icon name="check" />Works on your phone</li>
              <li><Icon name="check" />GSTIN, HSN/SAC and UPI ready</li>
            </ul>
          </div>
          <SnapDemo />
        </section>

        <section className="section" id="how" aria-labelledby="how-title">
          <div className="wrap">
            <h2 id="how-title">Works the way your customers already ask.</h2>
            <p className="sub">Text, photo or voice. English or Hinglish. You check the quote and press send.</p>
            <div className="grid3">
              <article className="tile">
                <h3><Icon name="text" />WhatsApp text</h3>
                <blockquote>“55 plates North Indian veg buffet aur 30 non-veg chahiye. Shaam ko 90 snack boxes bhi.”</blockquote>
                <p>Paste it in. Hinglish, typos and “approx” are fine.</p>
              </article>
              <article className="tile">
                <h3><Icon name="camera" />Photo of site notes</h3>
                <img src={sampleNoteUrl} alt="Handwritten site note listing a wardrobe, loft, false ceiling and painting with sizes" loading="lazy" width="640" height="320" />
                <p>Measurements like 8ft × 7ft become 56 sq ft automatically.</p>
              </article>
              <article className="tile">
                <h3><Icon name="mic" />Voice note</h3>
                <Wave bars={34} />
                <blockquote>“Master bedroom ka wardrobe 7 by 7 laminate wala, aur poore ghar ka painting Royale mein…”</blockquote>
                <p>Record in the app or upload the note your customer forwarded.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="trust" aria-labelledby="trust-title">
          <div className="wrap trust">
            <div>
              <h2 id="trust-title">The AI reads the message. It never sets your prices.</h2>
              <p className="sub">
                Every rupee comes from your own rate card and a fixed, tested calculation, so the same inquiry always gives the
                same total. If the AI isn't sure about something, it asks you instead of guessing.
              </p>
              <ul className="checks">
                <li><Icon name="check" />CGST + SGST within your state, IGST for other states, in one tap</li>
                <li><Icon name="check" />HSN/SAC on every line, mixed 5%, 12% and 18% rates on one quote</li>
                <li><Icon name="check" />Round-off to the rupee and amount in words in lakhs and crores</li>
                <li><Icon name="check" />GSTIN check and a UPI payment link for the advance</li>
              </ul>
            </div>
            <div className="pipe">
              <div className="pipe-node pipe-ai">
                <span className="ic"><Icon name="spark" /></span>
                <div><b>AI reads the inquiry</b><span>Items, sizes, customer name, location. Flags what's missing.</span></div>
              </div>
              <div className="pipe-link" aria-hidden="true" />
              <div className="pipe-node pipe-card">
                <span className="ic"><Icon name="card" /></span>
                <div><b>Your rate card sets the price</b><span>₹1,450 per sq ft for laminate wardrobes, because you said so.</span></div>
              </div>
              <div className="pipe-link" aria-hidden="true" />
              <div className="pipe-node pipe-math">
                <span className="ic"><Icon name="math" /></span>
                <div><b>Fixed GST calculation</b><span>Tested code, not a language model, does every sum.</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="trades" aria-labelledby="trades-title">
          <div className="wrap">
            <h2 id="trades-title">Ready-made rate cards for your trade.</h2>
            <p className="sub">Start from one of these and change the prices to yours, or import your own list from a spreadsheet.</p>
            <div className="grid3">
              {PRESET_BUSINESSES.map((b) => (
                <article className="tile trade" key={b.id}>
                  <div>
                    <h3>{b.categoryLabel}</h3>
                    <div className="gst">
                      GST {[...new Set(b.items.map((i) => i.gstPercent))].sort((a, c) => a - c).join('% and ')}%
                    </div>
                  </div>
                  <ul>
                    {b.items.slice(0, 4).map((i) => (
                      <li key={i.id}>
                        <span>{shortName(i.name)}</span>
                        <span className="num">{formatINRCompact(i.unitPrice)}/{i.unit}</span>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn" onClick={() => onTry(b.id)}>
                    Try with a sample
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="wrap">
            <h2 id="faq-title">Questions owners ask</h2>
            <div className="faq">
              <details open>
                <summary>Is this a GST invoice?</summary>
                <p>It's a quotation, the document you send before the job. Once the customer approves, you raise the tax invoice with the same numbers.</p>
              </details>
              <details>
                <summary>What if the AI picks the wrong item?</summary>
                <p>Lines the AI is unsure about are marked “Please check”, and anything missing goes on a checklist. You can change any item or quantity before sending.</p>
              </details>
              <details>
                <summary>Can I use my own prices?</summary>
                <p>Yes. Edit the rate card directly or import a CSV with item, unit, price, GST rate and HSN/SAC code.</p>
              </details>
              <details>
                <summary>Do my customers need an app?</summary>
                <p>No. They get a WhatsApp message with a link that opens the quote in any phone browser, where they can approve it and pay the advance by UPI.</p>
              </details>
            </div>
            <div className="cta-band">
              <div>
                <h2>Your next inquiry could be a sent quote before the customer calls someone else.</h2>
                <p>Try it with a sample message. It takes under a minute.</p>
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
                Make your first quote
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="wrap site-foot">
        <span>QuoteSnap AI, made in Bengaluru for Indian small businesses.</span>
        <span>Quotations follow CGST/SGST/IGST rules. Check rates with your CA.</span>
      </footer>
    </div>
  );
}
