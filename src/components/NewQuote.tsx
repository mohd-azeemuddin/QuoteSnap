import { useEffect, useRef, useState } from 'react';
import type { AgentExtractionResult, BusinessProfile, SavedQuote, SupplyType } from '../types.ts';
import { buildQuoteFromExtraction, computeQuoteLine, formatINR, formatINRCompact, recomputeQuoteLines, formatINRInWords } from '../utils/quoteMath.ts';
import { DEMO_EXTRACTIONS } from '../data/demoExtractions.ts';
import { blobToBase64, compressImage, cx, fmtDate, normalizeAudioMime, base64ToBlobUrl, shortName, STATE_CODES, snapshotExtras } from '../utils/ui.ts';
import sampleNoteUrl from '../assets/images/sample_handwritten_note_1794568290874.jpg';
import { Icon, Wave } from './Icon.tsx';
import { useToast } from './Dialog.tsx';

export interface MediaAttachment {
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}
type Mode = 'text' | 'photo' | 'voice';

const STEPS_BY_MODE: Record<Mode, string> = {
  text: 'Reading the message',
  photo: 'Reading the handwriting',
  voice: 'Listening to the voice note',
};

export function checklistOf(q: SavedQuote) {
  return [
    ...q.missingInfoFlags.map((t) => ({ key: `f:${t}`, text: t, hint: 'Confirm with the customer, or adjust the quote.', addLink: false })),
    ...q.unmatchedItems.map((t) => ({ key: `u:${t}`, text: `“${t}” isn't on your rate card.`, hint: 'Add it to your rate card, or leave it out.', addLink: true })),
  ];
}
export function openChecks(q: SavedQuote | null) {
  if (!q) return 0;
  const list = checklistOf(q);
  return list.filter((c) => !(q.checkedFlags ?? []).includes(c.key)).length;
}

/** Number field that lets people type freely ("1.", "") and commits valid numbers. */
function QtyInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    if (parseFloat(draft) !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '');
        setDraft(raw);
        const v = parseFloat(raw);
        if (Number.isFinite(v) && !raw.endsWith('.')) onCommit(v);
      }}
      onBlur={() => {
        const v = parseFloat(draft);
        onCommit(Number.isFinite(v) ? v : 0);
        setDraft(String(Number.isFinite(v) ? v : 0));
      }}
    />
  );
}

/* ---------------- flow stepper ---------------- */
function Flow({ quote }: { quote: SavedQuote | null }) {
  const open = openChecks(quote);
  const states = !quote ? [1, 0, 0] : quote.status !== 'Draft' ? [2, 2, 2] : open > 0 ? [2, 1, 0] : [2, 2, 1];
  const items: Array<[string, string]> = [
    ['Add inquiry', 'Paste, snap or record'],
    ['Check quote', quote ? (open > 0 ? `${open} thing${open > 1 ? 's' : ''} to confirm` : 'All confirmed') : 'Edit anything'],
    ['Send', 'On WhatsApp with a link'],
  ];
  return (
    <ol className="flow" aria-label="Quote progress">
      {items.map(([title, desc], i) => (
        <li key={title} className={states[i] === 2 ? 'done' : states[i] === 1 ? 'now' : ''} aria-current={states[i] === 1 ? 'step' : undefined}>
          <span className="n" aria-hidden="true">{states[i] === 2 ? <Icon name="check" className="icon" /> : i + 1}</span>
          <span>
            <b>{title}<span className="sr-only">{states[i] === 2 ? ' (done)' : states[i] === 1 ? ' (current step)' : ''}</span></b>
            <span className="d">{desc}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- main screen ---------------- */
export function NewQuote({
  business,
  quote,
  quoteCount,
  autoSampleId,
  onAutoSampleUsed,
  onQuoteCreated,
  onQuoteChange,
  onSend,
  onOpenDoc,
  onCopyLink,
  onGoRateCard,
}: {
  business: BusinessProfile;
  quote: SavedQuote | null;
  quoteCount: number;
  autoSampleId: string | null;
  onAutoSampleUsed: () => void;
  onQuoteCreated: (q: SavedQuote) => void;
  onQuoteChange: (q: SavedQuote) => void;
  onSend: (q: SavedQuote) => void;
  onOpenDoc: (q: SavedQuote) => void;
  onCopyLink: (q: SavedQuote) => void;
  onGoRateCard: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [image, setImage] = useState<MediaAttachment | null>(null);
  const [audio, setAudio] = useState<MediaAttachment | null>(null);
  const [demoKey, setDemoKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [loadingSample, setLoadingSample] = useState<'photo' | 'voice' | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const quoteHeading = useRef<HTMLHeadingElement>(null);

  // reset inputs when the business changes
  useEffect(() => {
    setText('');
    setImage(null);
    setAudio(null);
    setDemoKey(null);
    setError(null);
  }, [business.id]);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  // onboarding / landing "try a sample" auto-run
  useEffect(() => {
    if (!autoSampleId) return;
    const sample = business.sampleInquiries.find((s) => s.id === autoSampleId) ?? business.sampleInquiries[0];
    onAutoSampleUsed();
    if (sample) {
      setMode('text');
      setText(sample.text);
      setImage(null);
      setAudio(null);
      setDemoKey(sample.id);
      void generate({ text: sample.text, image: null, audio: null, demo: sample.id, mode: 'text' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSampleId]);

  /* ----- inputs ----- */
  const pickSample = (id: string) => {
    const s = business.sampleInquiries.find((x) => x.id === id);
    if (!s) return;
    setText(s.text);
    setDemoKey(s.id);
    setError(null);
    void generate({ text: s.text, image, audio, demo: s.id, mode: 'text' });
  };

  const takeImage = async (file: File) => {
    setMediaError(null);
    if (!file.type.startsWith('image/')) {
      setMediaError('Choose a photo (JPG, PNG or WebP).');
      return;
    }
    const small = await compressImage(file);
    const data = await blobToBase64(small);
    setImage({ name: file.name, mimeType: small.type || 'image/jpeg', data, previewUrl: URL.createObjectURL(small) });
    setDemoKey(null);
  };

  const useSamplePhoto = async () => {
    setLoadingSample('photo');
    setMediaError(null);
    try {
      const blob = await (await fetch(sampleNoteUrl)).blob();
      const data = await blobToBase64(blob);
      setImage({ name: 'site-note.jpg', mimeType: blob.type || 'image/jpeg', data, previewUrl: sampleNoteUrl });
      setDemoKey('int-photo');
    } catch {
      setMediaError('Could not load the sample photo. Check your connection and try again.');
    } finally {
      setLoadingSample(null);
    }
  };

  const takeAudio = async (file: File) => {
    setMediaError(null);
    const mime = normalizeAudioMime(file.type, file.name);
    if (!mime.startsWith('audio/')) {
      setMediaError('Choose an audio file (MP3, M4A, OGG, WAV or WebM).');
      return;
    }
    const data = await blobToBase64(file);
    setAudio({ name: file.name, mimeType: mime, data, previewUrl: URL.createObjectURL(file) });
    setDemoKey(null);
  };

  const useSampleVoice = async () => {
    setLoadingSample('voice');
    setMediaError(null);
    try {
      const resp = await fetch(`/api/sample-voice/${business.presetKey}`);
      const payload = await resp.json();
      if (!resp.ok || !payload.data) throw new Error(payload.error || 'unavailable');
      const mime = payload.mimeType || 'audio/wav';
      setAudio({ name: 'sample-voice-note', mimeType: mime, data: payload.data, previewUrl: base64ToBlobUrl(payload.data, mime) });
      setDemoKey(null);
    } catch {
      setMediaError("The sample voice note isn't available right now. Record one or upload an audio file instead.");
    } finally {
      setLoadingSample(null);
    }
  };

  const startRecording = async () => {
    setMediaError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaError("This browser can't record audio. Upload a voice note instead.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosen = types.find((t) => MediaRecorder.isTypeSupported(t));
      const r = chosen ? new MediaRecorder(s, { mimeType: chosen }) : new MediaRecorder(s);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        s.getTracks().forEach((t) => t.stop());
        const data = await blobToBase64(blob);
        const mime = normalizeAudioMime(blob.type);
        setAudio({ name: 'voice-note', mimeType: mime, data, previewUrl: URL.createObjectURL(blob) });
        setDemoKey(null);
      };
      recorder.current = r;
      r.start();
      setRecSecs(0);
      setRecording(true);
    } catch {
      setMediaError('Microphone access was blocked. Allow it in your browser settings, or upload a voice note.');
    }
  };
  const stopRecording = () => {
    recorder.current?.stop();
    setRecording(false);
  };

  /* ----- generate ----- */
  async function generate(input?: { text: string; image: MediaAttachment | null; audio: MediaAttachment | null; demo: string | null; mode: Mode }) {
    const t = input?.text ?? text;
    const img = input ? input.image : image;
    const aud = input ? input.audio : audio;
    const demo = input ? input.demo : demoKey;
    const m = input?.mode ?? mode;
    if (!t.trim() && !img && !aud) {
      setError('Add the customer\'s message, a photo or a voice note first.');
      return;
    }
    setError(null);
    setBusy(true);
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 700);
    const t2 = window.setTimeout(() => setStep(2), 1500);
    const started = performance.now();
    let extraction: AgentExtractionResult | null = null;
    let processingTimeMs = 0;
    let isDemo = false;
    try {
      const resp = await fetch('/api/extract-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: business.businessName,
          catalogItems: business.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, keywords: i.keywords })),
          inquiryText: t,
          image: img ? { mimeType: img.mimeType, data: img.data } : null,
          audio: aud ? { mimeType: aud.mimeType, data: aud.data } : null,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload.error || `The AI service returned an error (${resp.status}).`);
      extraction = payload.extraction as AgentExtractionResult;
      processingTimeMs = Number(payload.processingTimeMs) || Math.round(performance.now() - started);
    } catch (err) {
      if (demo && DEMO_EXTRACTIONS[demo]) {
        extraction = DEMO_EXTRACTIONS[demo];
        processingTimeMs = Math.round(performance.now() - started);
        isDemo = true;
      } else {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        setBusy(false);
        setError(
          err instanceof Error && err.message && !/fetch|network/i.test(err.message)
            ? err.message
            : "Couldn't reach the AI service. Check your internet connection and try again."
        );
        return;
      }
    }
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    setStep(3);
    const built = buildQuoteFromExtraction({
      business,
      extraction: extraction!,
      inquiryText: t,
      hasImage: Boolean(img),
      hasAudio: Boolean(aud),
      processingTimeMs,
      existingQuoteCount: quoteCount,
    });
    const q: SavedQuote = {
      ...built,
      businessSnapshot: { ...built.businessSnapshot, ...snapshotExtras(business) },
      checkedFlags: [],
      isDemo,
    };
    await new Promise((r) => setTimeout(r, 250));
    setBusy(false);
    onQuoteCreated(q);
    toast(isDemo ? `Quote ${q.quoteNumber} ready (saved example)` : `Quote ${q.quoteNumber} ready`);
    void m;
    window.setTimeout(() => quoteHeading.current?.focus(), 50);
  }

  /* ----- quote edits ----- */
  const update = (patch: Partial<SavedQuote>, lines = quote!.lines) => {
    const q = quote!;
    const supply = (patch.supplyType ?? q.supplyType) as SupplyType;
    const disc = patch.discountPercent ?? q.discountPercent;
    const r = recomputeQuoteLines(lines, disc, supply);
    onQuoteChange({ ...q, ...patch, lines: r.lines, totals: r.totals });
  };
  const setQty = (id: string, qty: number) =>
    update({}, quote!.lines.map((l) => (l.id === id ? { ...l, quantity: Math.max(0, Number.isFinite(qty) ? qty : 0), confidence: 'high' as const } : l)));
  const removeLine = (id: string) => {
    const line = quote!.lines.find((l) => l.id === id);
    update({}, quote!.lines.filter((l) => l.id !== id));
    if (line) toast(`Removed ${shortName(line.name)}`);
  };
  const addLine = (itemId: string) => {
    const item = business.items.find((i) => i.id === itemId);
    if (!item || !quote) return;
    const line = computeQuoteLine(item, 1, quote.discountPercent, 'Added by you', 'high', quote.supplyType);
    update({}, [...quote.lines, line]);
  };
  const toggleCheck = (key: string, on: boolean) => {
    const cur = quote!.checkedFlags ?? [];
    onQuoteChange({ ...quote!, checkedFlags: on ? [...cur, key] : cur.filter((k) => k !== key) });
  };

  const stateName = STATE_CODES[business.gstin.slice(0, 2)] ?? 'your state';
  const checklist = quote ? checklistOf(quote) : [];
  const done = quote ? checklist.length - openChecks(quote) : 0;
  const srcLabel = quote ? (quote.hasImage ? 'Photo' : quote.hasAudio ? 'Voice note' : 'WhatsApp text') : '';

  return (
    <>
      <Flow quote={quote} />
      <div className="bench">
        {/* ---------- inquiry ---------- */}
        <section className="card" aria-labelledby="inq-title">
          <div className="card-h">
            <h2 id="inq-title">Customer's inquiry</h2>
            <div className="seg" role="group" aria-label="Inquiry type">
              {(['text', 'photo', 'voice'] as Mode[]).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  <Icon name={m === 'text' ? 'text' : m === 'photo' ? 'camera' : 'mic'} />
                  {m === 'text' ? 'Text' : m === 'photo' ? 'Photo' : 'Voice'}
                  {m === 'photo' && image && <span className="sr-only">(photo added)</span>}
                  {m === 'voice' && audio && <span className="sr-only">(voice note added)</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="card-b">
            {mode === 'text' && (
              <>
                <label htmlFor="inquiry" className="sr-only">Customer's message</label>
                <textarea
                  id="inquiry"
                  className="msg"
                  placeholder="Paste the WhatsApp message here. Hinglish is fine."
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setDemoKey(null);
                  }}
                />
                {business.sampleInquiries.length > 0 && (
                  <div className="samples" role="group" aria-label="Sample inquiries">
                    <span className="hint">Try:</span>
                    {business.sampleInquiries.map((s) => (
                      <button key={s.id} type="button" className="chip" onClick={() => pickSample(s.id)} disabled={busy}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {mode === 'photo' && (
              <div
                className={cx('drop', dragOver && 'over')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void takeImage(f);
                }}
              >
                {image ? (
                  <img src={image.previewUrl} alt="Photo of the customer's requirements" />
                ) : (
                  <>
                    <Icon name="camera" className="icon" />
                    <b style={{ color: 'var(--ink)' }}>Snap or upload the site notes</b>
                    <span className="hint">A clear photo of a notebook page works best. Large photos are shrunk before upload.</span>
                  </>
                )}
                <div className="attach-row">
                  <label className="btn btn-sm" htmlFor="photo-input">
                    <Icon name="upload" />
                    {image ? 'Change photo' : 'Choose photo'}
                  </label>
                  <input
                    id="photo-input"
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => e.target.files?.[0] && void takeImage(e.target.files[0])}
                  />
                  {business.presetKey === 'interiors' && !image && (
                    <button type="button" className="btn btn-sm" onClick={useSamplePhoto} disabled={loadingSample === 'photo'}>
                      {loadingSample === 'photo' ? <Icon name="loader" className="icon spin" /> : null}
                      Use a sample site note
                    </button>
                  )}
                  {image && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setImage(null); setDemoKey(null); }}>
                      <Icon name="trash" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'voice' && (
              <div className="voice-box">
                {!recording ? (
                  <button type="button" className="btn btn-lg" onClick={startRecording}>
                    <Icon name="mic" />
                    {audio ? 'Record again' : 'Record a voice note'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-lg" onClick={stopRecording} aria-live="polite">
                    <span className="rec-dot" aria-hidden="true" />
                    Stop recording ({Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')})
                  </button>
                )}
                {audio && (
                  <div className="stack" style={{ gap: 8 }}>
                    <audio controls src={audio.previewUrl} style={{ width: '100%' }} aria-label="Voice note preview" />
                    <button type="button" className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setAudio(null)}>
                      <Icon name="trash" />
                      Remove voice note
                    </button>
                  </div>
                )}
                {!audio && !recording && <Wave bars={44} />}
                <div className="attach-row" style={{ justifyContent: 'flex-start' }}>
                  <label className="btn btn-sm" htmlFor="audio-input">
                    <Icon name="upload" />
                    Upload audio
                  </label>
                  <input id="audio-input" className="sr-only" type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && void takeAudio(e.target.files[0])} />
                  <button type="button" className="btn btn-sm" onClick={useSampleVoice} disabled={loadingSample === 'voice'}>
                    {loadingSample === 'voice' ? <Icon name="loader" className="icon spin" /> : <Icon name="play" />}
                    Load a sample voice note
                  </button>
                </div>
              </div>
            )}

            {mediaError && (
              <div className="alert alert-bad" role="alert" style={{ marginTop: 12 }}>
                <Icon name="warn" />
                <div>{mediaError}</div>
              </div>
            )}

            {(image || audio) && mode === 'text' && (
              <p className="hint" style={{ marginTop: 10 }}>
                Also sending: {[image && 'a photo', audio && 'a voice note'].filter(Boolean).join(' and ')}.
              </p>
            )}

            <div className="make-row">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => void generate()} disabled={busy} aria-describedby={error ? 'gen-error' : undefined}>
                {busy ? <Icon name="loader" className="icon spin" /> : <Icon name="spark" />}
                {busy ? 'Making quote…' : quote ? 'Make a new quote' : 'Make quote'}
              </button>
            </div>

            <div aria-live="polite">
              {busy && (
                <div className="agent">
                  {[STEPS_BY_MODE[image ? 'photo' : audio ? 'voice' : 'text'], 'Matching items to your rate card', 'Working out GST'].map((s, i) => (
                    <div key={s} className={cx('agent-step', step > i ? 'done' : step === i ? 'run' : '')}>
                      <span className="dot" aria-hidden="true">{step > i ? <Icon name="check" className="icon" /> : null}</span>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {error && (
              <div className="alert alert-bad" role="alert" id="gen-error" style={{ marginTop: 14 }}>
                <Icon name="warn" />
                <div>
                  {error}
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => void generate()}>Try again</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {quote && (
            <div className="card-b read">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 18 }}>What QuoteSnap read</h3>
                <span className="tag"><Icon name="spark" />{srcLabel}, {quote.detectedLanguage}</span>
              </div>
              {quote.isDemo && (
                <div className="alert alert-demo">
                  <Icon name="info" />
                  <div>The AI service didn't respond, so this is a saved example for this sample. The prices and GST are calculated live.</div>
                </div>
              )}
              {quote.overallSummary && <p className="muted">{quote.overallSummary}</p>}
              {quote.attachmentTranscript && (
                <details>
                  <summary className="hint" style={{ cursor: 'pointer' }}>Show what was {quote.hasImage ? 'written' : 'said'}</summary>
                  <div className="transcript">{quote.attachmentTranscript}</div>
                </details>
              )}
              {checklist.length > 0 ? (
                <div className="checklist">
                  <div className={cx('cl-h', done === checklist.length && 'all')}>
                    <span>{done === checklist.length ? 'All checked. Ready to send.' : `Before you send: ${checklist.length - done} to check`}</span>
                    <span className="num" aria-hidden="true">{done}/{checklist.length}</span>
                  </div>
                  <div className="cl-bar" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={done}>
                    <i style={{ width: `${(done / checklist.length) * 100}%` }} />
                  </div>
                  {checklist.map((c) => {
                    const on = (quote.checkedFlags ?? []).includes(c.key);
                    return (
                      <label key={c.key} className={cx('cl-item', on && 'ticked')}>
                        <input type="checkbox" checked={on} onChange={(e) => toggleCheck(c.key, e.target.checked)} />
                        <span className="t">
                          {c.text}
                          <small>{c.hint}</small>
                        </span>
                        {c.addLink ? (
                          <button type="button" className="btn btn-sm" onClick={onGoRateCard}>Add</button>
                        ) : (
                          <span />
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="alert alert-ok">
                  <Icon name="check" />
                  <div>Everything matched your rate card. Ready to send.</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ---------- quote ---------- */}
        <section className="card" aria-labelledby="quote-title">
          {!quote ? (
            <div className="empty">
              <h2 id="quote-title">Your quote appears here</h2>
              <p>Paste an inquiry or pick a sample, then press Make quote.</p>
            </div>
          ) : (
            <div className="card-b">
              <div className="q-top">
                <div>
                  <h2 className="q-no" id="quote-title" tabIndex={-1} ref={quoteHeading}>
                    {quote.quoteNumber}
                    <span className={`pill pill-${quote.status.toLowerCase()}`}>{quote.status}</span>
                    {quote.isDemo && <span className="pill pill-demo">Saved example</span>}
                  </h2>
                  <p className="hint">{fmtDate(quote.createdAt)}, valid till {fmtDate(quote.validUntil)}</p>
                </div>
                <div className="seg" role="group" aria-label="Where is the customer?">
                  <button type="button" aria-pressed={quote.supplyType === 'intra'} onClick={() => update({ supplyType: 'intra', placeOfSupply: `${stateName} (${business.gstin.slice(0, 2)})` })}>
                    Within {stateName}
                  </button>
                  <button type="button" aria-pressed={quote.supplyType === 'inter'} onClick={() => update({ supplyType: 'inter', placeOfSupply: 'Outside ' + stateName })}>
                    Other state
                  </button>
                </div>
              </div>

              <div className="cust">
                <div className="field">
                  <label htmlFor="c-name">Customer</label>
                  <input id="c-name" autoComplete="off" value={quote.customerName} placeholder="Name" onChange={(e) => onQuoteChange({ ...quote, customerName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="c-phone">WhatsApp number</label>
                  <input id="c-phone" inputMode="tel" autoComplete="off" value={quote.customerPhone} placeholder="10-digit mobile" onChange={(e) => onQuoteChange({ ...quote, customerPhone: e.target.value.replace(/[^\d+ ]/g, '') })} />
                </div>
                <div className="field">
                  <label htmlFor="c-loc">Site / area</label>
                  <input id="c-loc" autoComplete="off" value={quote.customerLocation} placeholder="Area" onChange={(e) => onQuoteChange({ ...quote, customerLocation: e.target.value })} />
                </div>
              </div>

              <div className="lines" role="table" aria-label="Quote items">
                <div className="line head" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Quantity</span>
                  <span role="columnheader" style={{ textAlign: 'right' }}>Rate</span>
                  <span role="columnheader" style={{ textAlign: 'right' }}>Amount</span>
                  <span role="columnheader"><span className="sr-only">Remove</span></span>
                </div>
                {quote.lines.map((l) => (
                  <div key={l.id} className={`line lc-${l.confidence}`} role="row">
                    <div role="cell">
                      <div className="nm">{shortName(l.name)}</div>
                      <div className="meta">
                        {l.confidence !== 'high' && <span className="chk">Please check</span>}
                        <span>{l.dimensionsNote}</span>
                      </div>
                    </div>
                    <div role="cell">
                      <div className="qty">
                        <button type="button" aria-label={`Decrease ${shortName(l.name)}`} onClick={() => setQty(l.id, Math.max(0, l.quantity - 1))}>−</button>
                        <QtyInput label={`Quantity of ${shortName(l.name)} in ${l.unit}`} value={l.quantity} onCommit={(v) => setQty(l.id, v)} />
                        <button type="button" aria-label={`Increase ${shortName(l.name)}`} onClick={() => setQty(l.id, l.quantity + 1)}>+</button>
                      </div>
                      <div className="qty-unit">{l.unit}</div>
                    </div>
                    <div role="cell" className="rate num">{formatINRCompact(l.unitPrice)}</div>
                    <div role="cell" className="amt num">{formatINR(l.discountedTaxable)}</div>
                    <div role="cell">
                      <button type="button" className="icon-btn" aria-label={`Remove ${shortName(l.name)}`} onClick={() => removeLine(l.id)}>
                        <Icon name="x" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="add-line">
                  <label htmlFor="add-item" className="sr-only">Add an item from your rate card</label>
                  <select id="add-item" value="" onChange={(e) => e.target.value && addLine(e.target.value)}>
                    <option value="">Add an item from your rate card…</option>
                    {business.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {shortName(i.name)} ({formatINRCompact(i.unitPrice)}/{i.unit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="q-bottom">
                <div className="stack">
                  <div className="field">
                    <label htmlFor="disc">Discount</label>
                    <div className="disc">
                      <input id="disc" type="range" min={0} max={25} step={0.5} value={quote.discountPercent} onChange={(e) => update({ discountPercent: Number(e.target.value) })} />
                      <output htmlFor="disc" className="num">{quote.discountPercent}%</output>
                    </div>
                  </div>
                  {quote.businessSnapshot.upiId && (
                    <p className="hint">
                      Customer can pay a {quote.businessSnapshot.advancePercent ?? 50}% advance (
                      <b className="num">{formatINR(Math.round((quote.totals.grandTotal * (quote.businessSnapshot.advancePercent ?? 50)) / 100), false)}</b>) by UPI from the quote link.
                    </p>
                  )}
                </div>
                <div className="totals" aria-live="polite" aria-atomic="true">
                  <div className="r"><span>Subtotal</span><span className="num">{formatINR(quote.totals.grossSubtotal)}</span></div>
                  {quote.totals.discountAmount > 0 && (
                    <div className="r"><span>Discount ({quote.discountPercent}%)</span><span className="num">− {formatINR(quote.totals.discountAmount)}</span></div>
                  )}
                  {quote.supplyType === 'inter' ? (
                    <div className="r"><span>IGST</span><span className="num">{formatINR(quote.totals.totalIgst)}</span></div>
                  ) : (
                    <>
                      <div className="r"><span>CGST</span><span className="num">{formatINR(quote.totals.totalCgst)}</span></div>
                      <div className="r"><span>SGST</span><span className="num">{formatINR(quote.totals.totalSgst)}</span></div>
                    </>
                  )}
                  <div className="r"><span>Round off</span><span className="num">{formatINR(quote.totals.roundOff)}</span></div>
                  <div className="r grand"><span>Total</span><span className="num">{formatINR(quote.totals.grandTotal, false)}</span></div>
                  <div className="words">{formatINRInWords(quote.totals.grandTotal)}</div>
                </div>
              </div>

              <div className="q-actions">
                <button type="button" className="btn btn-wa btn-lg" onClick={() => onSend(quote)} disabled={quote.lines.length === 0}>
                  <Icon name="wa" />
                  Send on WhatsApp
                </button>
                <button type="button" className="btn btn-ghost btn-lg" onClick={() => onOpenDoc(quote)}>
                  <Icon name="doc" />
                  PDF
                </button>
                <button type="button" className="btn btn-ghost btn-lg" onClick={() => onCopyLink(quote)}>
                  <Icon name="link" />
                  Copy link
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {quote && (
        <div className="sticky-total">
          <div>
            <small>Total incl. GST</small>
            <span className="num">{formatINR(quote.totals.grandTotal, false)}</span>
          </div>
          <button type="button" className="btn btn-wa" onClick={() => onSend(quote)}>
            <Icon name="wa" />
            Send
          </button>
        </div>
      )}
    </>
  );
}
