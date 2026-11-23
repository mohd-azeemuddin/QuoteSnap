import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRESET_BUSINESSES } from './data/presets.ts';
import type { BusinessProfile, QuoteStatus, SavedQuote } from './types.ts';
import { decodeShareableQuote } from './utils/quoteMath.ts';
import { shareUrl } from './utils/ui.ts';
import { Icon, Logo } from './components/Icon.tsx';
import { ToastProvider, copyText, useToast } from './components/Dialog.tsx';
import { Landing } from './components/Landing.tsx';
import { NewQuote } from './components/NewQuote.tsx';
import { QuotesView } from './components/QuotesView.tsx';
import { RateCardView } from './components/RateCardView.tsx';
import { CustomerView } from './components/CustomerView.tsx';
import { Onboarding } from './components/Onboarding.tsx';
import { DocDialog, ReminderDialog, SendDialog } from './components/QuoteDialogs.tsx';

type Route = 'home' | 'new-quote' | 'quotes' | 'rate-card' | 'customer-view';
const APP_ROUTES: Route[] = ['new-quote', 'quotes', 'rate-card', 'customer-view'];
const TITLES: Record<Route, string> = {
  home: 'QuoteSnap AI: WhatsApp inquiry to GST quote in 30 seconds',
  'new-quote': 'New quote · QuoteSnap',
  quotes: 'Quotes · QuoteSnap',
  'rate-card': 'Rate card · QuoteSnap',
  'customer-view': 'Customer view · QuoteSnap',
};
const KEYS = { businesses: 'qs2_businesses', active: 'qs2_active_business', quotes: 'qs2_quotes', current: 'qs2_current_quote', theme: 'qs2_theme' };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app keeps working in memory */
  }
}
const readRoute = (): Route => {
  const h = window.location.hash.slice(1);
  return (APP_ROUTES as string[]).includes(h) ? (h as Route) : 'home';
};
const sharedQuoteFromUrl = () => {
  const encoded = new URLSearchParams(window.location.search).get('quote');
  return encoded ? decodeShareableQuote(encoded) : null;
};

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const toast = useToast();
  const [shared] = useState<SavedQuote | null>(sharedQuoteFromUrl);
  const [route, setRoute] = useState<Route>(readRoute);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>(() => {
    const stored = load<BusinessProfile[]>(KEYS.businesses, []);
    return Array.isArray(stored) && stored.length ? stored : PRESET_BUSINESSES;
  });
  const [activeId, setActiveId] = useState<string>(() => load(KEYS.active, PRESET_BUSINESSES[0].id));
  const [quotes, setQuotes] = useState<SavedQuote[]>(() => {
    const q = load<SavedQuote[]>(KEYS.quotes, []);
    return Array.isArray(q) ? q : [];
  });
  const [currentId, setCurrentId] = useState<string | null>(() => load(KEYS.current, null));
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  const [dialog, setDialog] = useState<
    | { kind: 'send' | 'doc' | 'remind'; quoteId: string }
    | { kind: 'onboard'; initialId: string }
    | null
  >(null);
  const [autoSample, setAutoSample] = useState<string | null>(null);
  const [session, setSession] = useState(0); // bump to give 'New quote' a clean screen
  const keepQuote = useRef(false); // true when we navigate to open an existing quote
  const mainRef = useRef<HTMLElement>(null);
  const freshQuote = () => {
    setCurrentId(null);
    setSession((s) => s + 1);
  };

  useEffect(() => save(KEYS.businesses, businesses), [businesses]);
  useEffect(() => save(KEYS.active, activeId), [activeId]);
  useEffect(() => save(KEYS.quotes, quotes), [quotes]);
  useEffect(() => save(KEYS.current, currentId), [currentId]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save(KEYS.theme, theme);
  }, [theme]);

  // hash routing + focus management for screen readers
  useEffect(() => {
    const onHash = () => {
      const r = readRoute();
      setRoute(r);
      if (r === 'new-quote' && !keepQuote.current) freshQuote();
      keepQuote.current = false;
      const h = window.location.hash.slice(1);
      if (r === 'home' && h && document.getElementById(h)) {
        document.getElementById(h)!.scrollIntoView();
      } else {
        window.scrollTo(0, 0);
        if (r !== 'home') window.setTimeout(() => mainRef.current?.focus({ preventScroll: true }), 0);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = shared ? `Quotation ${shared.quoteNumber}` : TITLES[route];
  }, [route, shared]);

  const business = businesses.find((b) => b.id === activeId) ?? businesses[0];
  const belongs = useCallback(
    (q: SavedQuote) => (q.businessId ? q.businessId === business.id : q.businessSnapshot.presetKey === business.presetKey),
    [business]
  );
  const myQuotes = useMemo(() => quotes.filter(belongs), [quotes, belongs]);
  const current = quotes.find((q) => q.id === currentId && belongs(q)) ?? null;
  const go = (r: Route, keep = false) => {
    keepQuote.current = keep;
    if (window.location.hash !== `#${r}`) window.location.hash = r;
    else setRoute(r);
  };

  const upsertQuote = (q: SavedQuote) => setQuotes((prev) => (prev.some((x) => x.id === q.id) ? prev.map((x) => (x.id === q.id ? q : x)) : [q, ...prev]));
  const quoteById = (id: string) => quotes.find((q) => q.id === id);
  const copyLink = async (q: SavedQuote) => toast((await copyText(shareUrl(q))) ? 'Customer link copied' : 'Copy failed. Open the PDF instead.');

  if (shared) {
    return (
      <>
        <a className="skip-link" href="#main">Skip to quote</a>
        <CustomerView quote={shared} />
      </>
    );
  }

  const startOnboarding = (initialId = business.id) => setDialog({ kind: 'onboard', initialId });
  const tryBusiness = (id: string) => {
    const b = businesses.find((x) => x.id === id);
    setActiveId(id);
    setCurrentId(null);
    setAutoSample(b?.sampleInquiries[0]?.id ?? null);
    go('new-quote', true);
  };

  const navItems: Array<{ r: Route; label: string; short: string; icon: 'plus' | 'doc' | 'grid' | 'phone' }> = [
    { r: 'new-quote', label: 'New quote', short: 'New quote', icon: 'plus' },
    { r: 'quotes', label: 'Quotes', short: 'Quotes', icon: 'doc' },
    { r: 'rate-card', label: 'Rate card', short: 'Rate card', icon: 'grid' },
    { r: 'customer-view', label: 'Customer view', short: 'Customer', icon: 'phone' },
  ];
  const themeBtn = (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );

  const activeDialogQuote = dialog && 'quoteId' in dialog ? quoteById(dialog.quoteId) : undefined;

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); (document.getElementById('main') as HTMLElement | null)?.focus(); }}>
        Skip to main content
      </a>

      {route === 'home' ? (
        <>
          <Landing onStart={() => startOnboarding()} onTry={tryBusiness} themeButton={themeBtn} />
        </>
      ) : (
        <>
          <header className="app-head">
            <div className="row">
              <a className="brand" href="#home" aria-label="QuoteSnap home page">
                <Logo />
                <span className="wordmark" aria-hidden="true">QuoteSnap</span>
              </a>
              <div className="biz-select">
                <span className="logo" aria-hidden="true">{(business.businessName || 'Q')[0]}</span>
                <label htmlFor="biz" className="sr-only">Business</label>
                <select
                  id="biz"
                  value={business.id}
                  onChange={(e) => {
                    setActiveId(e.target.value);
                    setCurrentId(null);
                    const b = businesses.find((x) => x.id === e.target.value);
                    toast(`Switched to ${b?.presetName ?? 'business'}`);
                  }}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.businessName || b.presetName}</option>
                  ))}
                </select>
              </div>
              <nav className="app-nav" aria-label="Main">
                {navItems.map((n) => (
                  <a key={n.r} href={`#${n.r}`} aria-current={route === n.r ? 'page' : undefined} onClick={() => n.r === 'new-quote' && route === 'new-quote' && freshQuote()}>
                    <Icon name={n.icon} />
                    {n.label}
                  </a>
                ))}
              </nav>
              <div style={{ marginLeft: 'auto' }}>{themeBtn}</div>
            </div>
          </header>

          <main id="main" ref={mainRef} tabIndex={-1} className="app-main" style={{ outline: 'none' }}>
            {route === 'new-quote' && (
              <NewQuote
                key={`${business.id}-${session}`}
                business={business}
                quote={current}
                quoteCount={quotes.length}
                autoSampleId={autoSample}
                onAutoSampleUsed={() => setAutoSample(null)}
                onQuoteCreated={(q) => {
                  const withBiz = { ...q, businessId: business.id };
                  upsertQuote(withBiz);
                  setCurrentId(withBiz.id);
                }}
                onQuoteChange={upsertQuote}
                onSend={(q) => setDialog({ kind: 'send', quoteId: q.id })}
                onOpenDoc={(q) => setDialog({ kind: 'doc', quoteId: q.id })}
                onCopyLink={copyLink}
                onGoRateCard={() => go('rate-card')}
              />
            )}
            {route === 'quotes' && (
              <QuotesView
                quotes={myQuotes}
                businessName={business.businessName}
                onOpen={(q) => {
                  setCurrentId(q.id);
                  go('new-quote', true);
                }}
                onStatus={(q, s: QuoteStatus) => {
                  upsertQuote({ ...q, status: s, sentAt: s === 'Sent' ? new Date().toISOString() : q.sentAt });
                  toast(`${q.quoteNumber} marked ${s.toLowerCase()}`);
                }}
                onRemind={(q) => setDialog({ kind: 'remind', quoteId: q.id })}
                onDelete={(q) => {
                  if (!window.confirm(`Delete quote ${q.quoteNumber}? This can't be undone.`)) return;
                  setQuotes((prev) => prev.filter((x) => x.id !== q.id));
                  if (currentId === q.id) setCurrentId(null);
                  toast(`Deleted ${q.quoteNumber}`);
                }}
              />
            )}
            {route === 'rate-card' && (
              <RateCardView business={business} onChange={(b) => setBusinesses((prev) => prev.map((x) => (x.id === b.id ? b : x)))} />
            )}
            {route === 'customer-view' &&
              (current ?? myQuotes[0] ? (
                <CustomerView quote={(current ?? myQuotes[0])!} preview onExit={() => go('new-quote', true)} />
              ) : (
                <div className="card empty">
                  <h1 style={{ fontSize: 28 }}>Make a quote first</h1>
                  <p>Once you have a quote, this shows exactly what your customer sees when they open your link.</p>
                  <a className="btn btn-primary" href="#new-quote">Make a quote</a>
                </div>
              ))}
          </main>

          <nav className="bottom-nav" aria-label="Main">
            {navItems.map((n) => (
              <a key={n.r} href={`#${n.r}`} aria-current={route === n.r ? 'page' : undefined} onClick={() => n.r === 'new-quote' && route === 'new-quote' && freshQuote()}>
                <Icon name={n.icon} />
                {n.short}
              </a>
            ))}
          </nav>
        </>
      )}

      {dialog?.kind === 'send' && activeDialogQuote && (
        <SendDialog quote={activeDialogQuote} onClose={() => setDialog(null)} onSent={upsertQuote} />
      )}
      {dialog?.kind === 'doc' && activeDialogQuote && (
        <DocDialog quote={activeDialogQuote} onClose={() => setDialog(null)} onSend={() => setDialog({ kind: 'send', quoteId: activeDialogQuote.id })} />
      )}
      {dialog?.kind === 'remind' && activeDialogQuote && <ReminderDialog quote={activeDialogQuote} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'onboard' && (
        <Onboarding
          businesses={businesses}
          initialId={dialog.initialId}
          onClose={() => setDialog(null)}
          onDone={(b, makeSample) => {
            setBusinesses((prev) => (prev.some((x) => x.id === b.id) ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b]));
            setActiveId(b.id);
            setCurrentId(null);
            setDialog(null);
            if (makeSample) {
              setAutoSample(b.sampleInquiries[0].id);
              go('new-quote', true);
            } else go('rate-card');
          }}
        />
      )}
    </>
  );
}
