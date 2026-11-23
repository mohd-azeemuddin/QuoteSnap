import type { AgentExtractionResult, ExtractedLineItem } from '../types.ts';

/**
 * Saved example readings for the built-in sample inquiries.
 * Used only when the live AI service can't be reached, so a demo never dead-ends.
 * Quotes built from these are marked `isDemo` and labelled in the UI.
 */

type Line = [catalogItemId: string, quantity: number, dimensionsNote: string, confidence: ExtractedLineItem['confidence']];

function x(
  name: string,
  phone: string,
  location: string,
  language: string,
  summary: string,
  lines: Line[],
  flags: string[],
  en: string,
  hi: string,
  opts: { transcript?: string; unmatched?: string[] } = {}
): AgentExtractionResult {
  return {
    customerName: name,
    customerPhone: phone,
    customerLocation: location,
    detectedLanguage: language,
    confidenceScore: lines.every((l) => l[3] === 'high') ? 0.95 : 0.78,
    overallSummary: summary,
    attachmentTranscript: opts.transcript ?? '',
    lineItems: lines.map(([catalogItemId, quantity, dimensionsNote, confidence]) => ({
      catalogItemId,
      matchedName: catalogItemId,
      quantity,
      dimensionsNote,
      confidence,
      reasoning: dimensionsNote,
    })),
    missingInfoFlags: flags,
    unmatchedItems: opts.unmatched ?? [],
    whatsappFollowUpEn: en,
    whatsappFollowUpHinglish: hi,
  };
}

export const DEMO_EXTRACTIONS: Record<string, AgentExtractionResult> = {
  'int-sample-1': x(
    'Ramesh', '', 'Whitefield', 'Hinglish',
    '2BHK in Whitefield: laminate wardrobe, kitchen loft and hall false ceiling. Customer wants it urgently.',
    [
      ['int-wardrobe-lam', 56, '8 ft × 7 ft = 56 sq ft', 'high'],
      ['int-kitchen-loft', 25, 'Approx 25 sq ft, as stated', 'medium'],
      ['int-false-ceiling', 180, 'Hall, 180 sq ft as stated', 'high'],
    ],
    ['Loft size is approximate (about 25 sq ft).', 'Wardrobe shutter type not mentioned. Priced as hinged.'],
    'Hi Ramesh, thanks for reaching out! Here is your GST quote. Could you confirm whether you want sliding or hinged wardrobe shutters, and whether the loft is about 25 sq ft?',
    'Namaste Ramesh ji! Aapka GST quote ready hai. Wardrobe mein sliding shutter chahiye ya hinged? Aur loft approx 25 sq ft hi hai na?'
  ),
  'int-sample-2': x(
    'Ananya', '9900123456', 'HSR Layout', 'English',
    'Flat at Prestige Lakeside HSR: acrylic wardrobe, TV unit and full-flat painting.',
    [
      ['int-wardrobe-acr', 63, '9 ft wide × 7 ft (standard height assumed)', 'medium'],
      ['int-tv-unit', 40, '40 sq ft as stated', 'high'],
      ['int-painting-tractor', 1400, 'Around 1,400 sq ft', 'high'],
    ],
    ['Wardrobe height not given. Assumed the standard 7 ft.'],
    'Hi Ananya, thanks for contacting us! Here is your GST quote. Is a 7 ft wardrobe height okay, or would you like it up to the ceiling?',
    'Hi Ananya ji! Aapka GST quote ready hai. Wardrobe height 7 ft chalega ya ceiling tak chahiye?'
  ),
  'int-sample-3': x(
    '', '', 'Sarjapur', 'Hinglish',
    'Sarjapur flat: bedroom wardrobe, hall false ceiling with 8 light points, kitchen loft. No sizes given.',
    [
      ['int-wardrobe-lam', 42, 'Size missing. Assumed 6 ft × 7 ft', 'low'],
      ['int-false-ceiling', 150, 'Size missing. Assumed a 150 sq ft hall', 'low'],
      ['int-electrical-point', 8, '8 LED points as stated', 'high'],
      ['int-kitchen-loft', 20, 'Size missing. Assumed 20 sq ft', 'low'],
    ],
    ['Wardrobe size missing. Assumed 6 × 7 ft.', 'Hall size missing for the false ceiling.', 'Loft size missing.', 'No customer name or phone number.'],
    'Hi, thanks for your inquiry! Here is an estimate based on standard sizes. Could you share the wardrobe width and height, the hall size, and how long the kitchen loft should be?',
    'Namaste! Standard size ke hisaab se estimate bheja hai. Wardrobe ki width-height, hall ka size aur kitchen loft ki length bata dijiye, final quote bhej denge.'
  ),
  'int-photo': x(
    'Karthik Reddy', '', 'Indiranagar', 'English (handwritten)',
    'Handwritten site note for an Indiranagar 3BHK, four items with sizes.',
    [
      ['int-wardrobe-lam', 56, '8 ft × 7 ft = 56 sq ft', 'high'],
      ['int-kitchen-loft', 30, '30 sq ft as written', 'high'],
      ['int-false-ceiling', 220, 'Living hall, 220 sq ft', 'high'],
      ['int-painting-tractor', 950, '950 sq ft as written', 'high'],
    ],
    ['No phone number on the note.'],
    'Hi Karthik, here is the GST quote for your Indiranagar 3BHK based on the site measurements.',
    'Namaste Karthik ji! Indiranagar 3BHK ka GST quote site measurement ke hisaab se ready hai.',
    {
      transcript:
        'Indiranagar 3BHK – Karthik Reddy\n1. Wardrobe Laminate 8ft x 7ft (56 sqft)\n2. Modular Kitchen Loft – 30 sqft\n3. Living Hall False Ceiling – 220 sqft\n4. Tractor Emulsion Wall Paint – 950 sqft\nPlease send GST quote',
    }
  ),
  'prt-sample-1': x(
    'Vikram (BrewHaus)', '', 'Koramangala 5th Block', 'Hinglish',
    'New cafe launch: glow sign board, standees, visiting cards and brochures. Wants delivery tomorrow.',
    [
      ['prt-vinyl-backlit', 30, '10 ft × 3 ft = 30 sq ft', 'high'],
      ['prt-rollup-standee', 4, '4 standees', 'high'],
      ['prt-visiting-cards', 1000, '1,000 cards', 'high'],
      ['prt-brochures', 500, '500 tri-fold', 'high'],
    ],
    ['Wants delivery tomorrow. Standard delivery is 48 hours.'],
    'Hi Vikram, congrats on the new cafe! Here is your GST quote. Our standard delivery is 48 hours. Is the day after tomorrow okay?',
    'Hi Vikram bhai, new cafe ke liye congrats! GST quote ready hai. Normal delivery 48 ghante mein hoti hai, parso chalega?'
  ),
  'prt-sample-2': x(
    'Priya', '', 'Manyata Tech Park', 'English',
    'Event stall: two flex banners, sunboard mounting and flyers.',
    [
      ['prt-flex-banner', 64, '2 × (8 ft × 4 ft) = 64 sq ft', 'high'],
      ['prt-sunboard', 60, '60 sq ft as stated', 'high'],
    ],
    [],
    'Hi Priya, here is the GST estimate for your Manyata stall. Flyers are not on our standard list yet, so we will confirm that price separately.',
    'Hi Priya ji! Manyata stall ka GST estimate ready hai. Flyers ka rate alag se confirm karenge.',
    { unmatched: ['300 glossy flyers'] }
  ),
  'prt-sample-3': x(
    'Dr. Nair', '', 'Indiranagar', 'Hinglish',
    'Dental clinic: 3D LED letter board and 500 visiting cards.',
    [
      ['prt-acrylic-led', 12, 'Letter height missing. Assumed 12 inch', 'low'],
      ['prt-visiting-cards', 500, '500 pcs', 'high'],
    ],
    ['Letter height and board wording missing.'],
    'Hello Dr. Nair, here is an estimate. What text should the board say, and how tall should the letters be?',
    'Namaste Dr. Nair! Estimate bheja hai. Board pe kya likhna hai aur letters kitne inch ke chahiye?'
  ),
  'cat-sample-1': x(
    'Sneha', '', 'Bellandur (Ecospace)', 'Hinglish',
    'Friday townhall for 85: veg and non-veg lunch buffet, evening snacks and chai.',
    [
      ['cat-veg-north', 55, '55 plates', 'high'],
      ['cat-nonveg-feast', 30, '30 plates', 'high'],
      ['cat-snack-box', 90, '90 boxes, evening', 'high'],
      ['cat-chai-flask', 5, '5 flasks', 'high'],
    ],
    ['Service staff not requested for 85 guests.'],
    'Hi Sneha, here is the GST quote for Friday. Would you like 2 service staff with chafing dishes for the buffet?',
    'Hi Sneha ji! Friday ka GST quote ready hai. Buffet ke liye 2 service staff bhi bhej dein?'
  ),
  'cat-sample-2': x(
    '', '', 'Koramangala', 'English',
    'Demo day next Wednesday for 120 guests: South Indian buffet, live dosa counter, staff.',
    [
      ['cat-veg-south', 120, '120 guests', 'high'],
      ['cat-live-dosa', 1, '1 counter', 'high'],
      ['cat-service-staff', 3, '3 staff', 'high'],
    ],
    ['No customer name or phone number.'],
    'Hi, thanks for the inquiry! Here is the GST quote for 120 guests next Wednesday.',
    'Namaste! Next Wednesday 120 guests ka GST quote ready hai.'
  ),
  'cat-sample-3': x(
    '', '', 'MG Road', 'Hinglish',
    '2-day workshop for 40–50 people: morning chai and evening snacks, asked about lunch.',
    [
      ['cat-chai-flask', 6, '3 flasks a day × 2 days (assumed)', 'low'],
      ['cat-snack-box', 100, '50 people × 2 days (upper count)', 'medium'],
    ],
    ['Headcount is a range (40–50). Priced for 50.'],
    'Hi, here is an estimate for 50 people over 2 days. Do you have a final headcount? We can also add a lunch buffet.',
    'Namaste! 2 din, 50 log ke hisaab se estimate bheja hai. Final count bata dijiye, lunch buffet bhi add kar sakte hain.',
    { unmatched: ['Lunch option (customer asked for a suggestion)'] }
  ),
};
