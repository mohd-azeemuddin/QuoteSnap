# QuoteSnap AI v2

**WhatsApp inquiry in. GST quote out. In 30 seconds.**

QuoteSnap turns the way Indian customers actually ask for prices (Hinglish WhatsApp messages, photos of handwritten site notes, voice notes) into accurate GST quotations that a small business owner can check and send on WhatsApp in under a minute.

## Why it's trustworthy: the AI never sets prices

```
Inquiry (text / photo / voice) + rate card (names only, no prices)
        │
        ▼  POST /api/extract-quote   Gemini multimodal + strict JSON schema
Items matched to catalog IDs, quantities (8x7 ft → 56 sq ft), customer details,
anything missing or uncertain flagged for the owner
        │
        ▼  src/utils/quoteMath.ts    deterministic, unit-tested TypeScript
Prices from the owner's rate card, CGST + SGST or IGST, discount, ₹1 round-off,
amount in words (lakhs / crores)
```

The same inquiry always produces the same total. Lines the AI is unsure about are marked **Please check**, and missing details go on a **Before you send** checklist.

## What's new in v2

- **Guided 3-step flow:** Add inquiry → Check quote → Send, with progress shown at the top.
- **Checklist instead of warnings:** each missing detail is a tick box. When everything is ticked, the quote is ready to send.
- **3-step onboarding:** pick a trade, confirm GSTIN (validated, with the state shown), make the first quote.
- **Customer page from the WhatsApp link:** no login. The customer approves (which sends a WhatsApp message to the business) and pays the advance with any UPI app.
- **Quote pipeline:** Draft / Sent / Won / Lost, open value, won value, win rate, time saved, and a one-tap reminder for quotes with no reply after 2 days.
- **Rate card editor:** inline editing, keywords customers use, CSV import/export, advance % and terms.
- **One-page A4 PDF:** GSTIN, HSN/SAC, tax split, amount in words, UPI advance, terms.
- **Accessible:** WCAG AA colour contrast in light and dark themes, full keyboard use, labelled controls, focus-trapped dialogs, screen-reader announcements for progress and totals, 44px touch targets, reduced-motion support.
- **Fast:**
  - No icon or animation libraries.
  - Photos are shrunk in the browser before upload (about 4 MB down to about 300 KB).
  - The sample image is 134 KB, down from 848 KB.
  - Build files are cached long-term.
- **Demo-safe:** if the AI service can't be reached, the built-in sample inquiries fall back to a saved example, clearly labelled. Prices and GST are still calculated live.

## Tech stack

React 19 + TypeScript, plain CSS design system, Vite. Node 22 + Express.

**AI:** Claude Haiku 5.5 reads text and photo inquiries when `ANTHROPIC_API_KEY` is set (fast and low-cost). Gemini (`@google/genai`) reads voice notes, and handles everything if no Anthropic key is set.

## Run locally

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # http://localhost:3000
npm test                  # GST engine tests
npm run build
NODE_ENV=production npm start
```

## Deploy on Render (free)

1. New → Web Service → connect this repository.
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start`
4. **Environment variables:**
   - `ANTHROPIC_API_KEY`: your Claude API key (text and photo quotes)
   - `GEMINI_API_KEY`: your Gemini key (voice notes)
   - `NODE_ENV`: `production`
5. **Health check path:** `/api/health`

The free plan sleeps after 15 minutes without traffic. To keep it awake for a demo, ping `/api/health` every 10 minutes (for example with cron-job.org), or switch the instance to Starter.
