import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWithClaude, toJsonSchema } from '../claude.ts';

const geminiSchema = { type: 'OBJECT', properties: { customerName: { type: 'STRING' }, lineItems: { type: 'ARRAY', items: { type: 'OBJECT', properties: { quantity: { type: 'NUMBER' } }, required: ['quantity'] } } }, required: ['customerName', 'lineItems'] };
const ok = { customerName: 'Ramesh', lineItems: [{ quantity: 56 }] };
process.env.ANTHROPIC_API_KEY = 'test-key';
type Call = { url: string; body: any; headers: any };
function mockFetch(responses: Array<{ status: number; body: any }>) {
  const calls: Call[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = responses.shift()!;
    return { ok: r.status < 300, status: r.status, json: async () => r.body } as any;
  };
  return calls;
}

test('schema conversion', () => {
  const s = toJsonSchema(geminiSchema);
  assert.equal(s.type, 'object'); assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.lineItems.items.properties.quantity.type, 'number');
});

test('structured request with text + image, parses JSON', async () => {
  const calls = mockFetch([{ status: 200, body: { content: [{ type: 'text', text: JSON.stringify(ok) }] } }]);
  const out = await extractWithClaude([{ text: 'hello' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAA' } }], 'sys', geminiSchema);
  assert.deepEqual(out, ok);
  const b = calls[0].body;
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'test-key');
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.equal(b.messages[0].content[1].type, 'image');
  assert.equal(b.messages[0].content[1].source.media_type, 'image/jpeg');
});

test('falls back to plain JSON when schema option is rejected; strips code fences', async () => {
  const calls = mockFetch([
    { status: 400, body: { error: { message: 'output_config: unsupported for this model' } } },
    { status: 200, body: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(ok) + '\n```' }] } },
  ]);
  assert.deepEqual(await extractWithClaude([{ text: 'x' }], 'sys', geminiSchema), ok);
  assert.equal(calls[1].body.output_config, undefined);
  assert.match(calls[1].body.system, /JSON Schema/);
});

test('bad key gives an API_KEY error without retrying', async () => {
  const calls = mockFetch([{ status: 401, body: { error: { message: 'invalid x-api-key' } } }]);
  await assert.rejects(extractWithClaude([{ text: 'x' }], 'sys', geminiSchema), /API_KEY/);
  assert.equal(calls.length, 1);
});

test('retries once on overload, then succeeds', async () => {
  const calls = mockFetch([{ status: 529, body: { error: { message: 'Overloaded' } } }, { status: 200, body: { content: [{ type: 'text', text: JSON.stringify(ok) }] } }]);
  assert.deepEqual(await extractWithClaude([{ text: 'x' }], 'sys', geminiSchema), ok);
  assert.equal(calls.length, 2);
});
