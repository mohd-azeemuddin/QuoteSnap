import { useState } from 'react';
import type { BusinessProfile } from '../types.ts';
import { isValidGSTIN } from '../utils/quoteMath.ts';
import { Dialog } from './Dialog.tsx';
import { GstinField } from './RateCardView.tsx';
import { Icon } from './Icon.tsx';

/** Three short steps: pick a trade, confirm details, make the first quote. */
export function Onboarding({
  businesses,
  initialId,
  onClose,
  onDone,
}: {
  businesses: BusinessProfile[];
  initialId: string;
  onClose: () => void;
  onDone: (b: BusinessProfile, makeSample: boolean) => void;
}) {
  const [step, setStep] = useState(1);
  const [pick, setPick] = useState<string>(initialId);
  const base = businesses.find((b) => b.id === pick);
  const [draft, setDraft] = useState(() => ({
    name: base?.businessName ?? '',
    gstin: base?.gstin ?? '',
    phone: base?.phone ?? '',
    upi: base?.upiId ?? '',
  }));
  const [nameError, setNameError] = useState(false);

  const choose = (id: string) => {
    setPick(id);
    const b = businesses.find((x) => x.id === id);
    setDraft({ name: b?.businessName ?? '', gstin: b?.gstin ?? '', phone: b?.phone ?? '', upi: b?.upiId ?? '' });
  };

  const finish = () => {
    const template: BusinessProfile = base ?? {
      id: `custom-${Date.now()}`,
      presetKey: 'custom',
      presetName: draft.name || 'My business',
      categoryLabel: 'My business',
      businessName: draft.name,
      gstin: '',
      phone: '',
      address: '',
      items: [],
      sampleInquiries: [],
    };
    const b: BusinessProfile = {
      ...template,
      businessName: draft.name.trim(),
      presetName: pick === 'blank' ? draft.name.trim() : template.presetName,
      gstin: isValidGSTIN(draft.gstin) ? draft.gstin : template.gstin && pick !== 'blank' ? template.gstin : draft.gstin,
      phone: draft.phone,
      upiId: draft.upi || undefined,
    };
    onDone(b, b.sampleInquiries.length > 0);
  };

  const titles = ['What do you sell?', 'Your business details', "You're set up"];
  return (
    <Dialog
      title={titles[step - 1]}
      onClose={onClose}
      headerExtra={
        <div className="stepper" aria-hidden="true">
          <i className="on" /><i className={step > 1 ? 'on' : ''} /><i className={step > 2 ? 'on' : ''} />
          <span>Step {step} of 3</span>
        </div>
      }
      footer={
        <>
          {step === 2 && <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>}
          <button
            type="button"
            className="btn btn-primary"
            data-autofocus={step === 3 ? true : undefined}
            onClick={() => {
              if (step === 2) {
                if (!draft.name.trim()) {
                  setNameError(true);
                  document.getElementById('o-name')?.focus();
                  return;
                }
              }
              if (step < 3) setStep(step + 1);
              else finish();
            }}
          >
            {step === 3 ? (base && base.sampleInquiries.length ? 'Make my first quote' : 'Open my rate card') : 'Continue'}
          </button>
        </>
      }
    >
      <p className="sr-only" aria-live="polite">Step {step} of 3: {titles[step - 1]}</p>
      {step === 1 && (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>We'll load a starter rate card. You can change every price later.</p>
          <div className="pick" role="group" aria-label="Your trade">
            {businesses.filter((b) => b.presetKey !== 'custom').map((b) => (
              <button key={b.id} type="button" aria-pressed={pick === b.id} onClick={() => choose(b.id)}>
                <b>{b.categoryLabel}</b>
                <span>{b.items.length} items, GST {[...new Set(b.items.map((i) => i.gstPercent))].sort((a, c) => a - c).join('% / ')}%</span>
              </button>
            ))}
            <button type="button" aria-pressed={pick === 'blank'} onClick={() => choose('blank')}>
              <b>Something else</b>
              <span>Start with an empty rate card</span>
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <div className="form-grid">
          {pick !== 'blank' && (
            <p className="hint full" style={{ margin: '-4px 0 4px' }}>Example details are filled in so you can try it now. Replace them with yours any time.</p>
          )}
          <div className="field full">
            <label htmlFor="o-name">Business name</label>
            <input
              id="o-name"
              data-autofocus
              value={draft.name}
              aria-invalid={nameError}
              aria-describedby={nameError ? 'o-name-err' : undefined}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setNameError(false);
              }}
            />
            {nameError && <span id="o-name-err" className="err">Enter your business name.</span>}
          </div>
          <div className="full">
            <GstinField id="o-gstin" value={draft.gstin} onChange={(gstin) => setDraft({ ...draft, gstin })} />
          </div>
          <div className="field">
            <label htmlFor="o-phone">WhatsApp number</label>
            <input id="o-phone" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="o-upi">UPI ID (optional)</label>
            <input id="o-upi" value={draft.upi} placeholder="yourname@okbank" onChange={(e) => setDraft({ ...draft, upi: e.target.value.trim() })} />
          </div>
        </div>
      )}
      {step === 3 && (
        <div style={{ textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center', padding: '8px 0' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--ok-soft)', color: 'var(--ok)', display: 'grid', placeItems: 'center' }}>
            <Icon name="check" />
          </span>
          <h3 style={{ fontSize: 24 }}>{draft.name || 'Your business'} is ready</h3>
          <p className="hint" style={{ maxWidth: '30em' }}>
            {base && base.sampleInquiries.length
              ? "Let's make your first quote from a real-looking customer message. You can change anything before it goes out."
              : 'Add the things you sell and their prices, then make your first quote.'}
          </p>
        </div>
      )}
    </Dialog>
  );
}
