/* ------------------------------------------------------------------ */
/* Claude (Anthropic) extraction: used for text and photo inquiries     */
/* when ANTHROPIC_API_KEY is set. Claude does not take audio, so voice   */
/* notes still go to Gemini.                                             */
/* ------------------------------------------------------------------ */
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Convert the Gemini response schema (Type.OBJECT etc.) into plain JSON Schema. */
export function toJsonSchema(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  if (s.type) out.type = String(s.type).toLowerCase();
  if (s.description) out.description = s.description;
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.additionalProperties = false;
  }
  if (s.items) out.items = toJsonSchema(s.items);
  if (s.required) out.required = s.required;
  return out;
}

export function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

export async function extractWithClaude(parts: Part[], systemInstruction: string, geminiSchema: unknown): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const schema = toJsonSchema(geminiSchema);
  const content = parts.map((p) =>
    'text' in p
      ? { type: 'text', text: p.text }
      : { type: 'image', source: { type: 'base64', media_type: p.inlineData.mimeType, data: p.inlineData.data } }
  );

  const call = async (structured: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const body: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        system: structured
          ? systemInstruction
          : `${systemInstruction}\n\nRespond with ONLY one JSON object (no markdown) that matches this JSON Schema:\n${JSON.stringify(schema)}`,
        messages: [{ role: 'user', content }],
      };
      if (structured) body.output_config = { format: { type: 'json_schema', schema } };
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data?.error?.message || `HTTP ${resp.status}`;
        const err = new Error(`Claude ${resp.status}: ${msg}`) as Error & { status?: number };
        err.status = resp.status;
        throw err;
      }
      const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      return parseJsonText(text);
    } finally {
      clearTimeout(timer);
    }
  };

  let lastError: unknown;
  let structured = true;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await call(structured);
    } catch (err: any) {
      lastError = err;
      console.error(`[claude] attempt ${attempt + 1} failed:`, String(err?.message ?? err).slice(0, 300));
      const status = err?.status as number | undefined;
      // If this model/API version doesn't accept the schema option, ask for plain JSON instead.
      if (status === 400 && structured && /output_config|format|schema/i.test(String(err?.message))) {
        structured = false;
        continue;
      }
      if (status === 401 || status === 403) throw new Error('API_KEY: Claude rejected the API key. Check ANTHROPIC_API_KEY.');
      if (status === 400 && /credit|balance|billing/i.test(String(err?.message))) {
        throw new Error('RESOURCE_EXHAUSTED: Anthropic credit balance is too low.');
      }
      if (status && status < 500 && status !== 429) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

