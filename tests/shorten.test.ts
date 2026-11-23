import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnQuoteLink, shortenUrl } from '../shorten.ts';

const fake = (replies: Array<{ ok: boolean; status: number; text: string } | 'throw'>) => {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(url);
    const r = replies.shift()!;
    if (r === 'throw') throw new Error('network');
    return { ok: r.ok, status: r.status, text: async () => r.text } as Response;
  }) as unknown as typeof fetch;
  return { f, urls };
};

test('only own quote links are accepted', () => {
  assert.equal(isOwnQuoteLink('https://quotesnap-3f51.onrender.com/?q=zABC', 'quotesnap-3f51.onrender.com'), true);
  assert.equal(isOwnQuoteLink('https://evil.example/?q=zABC', 'quotesnap-3f51.onrender.com'), false);
  assert.equal(isOwnQuoteLink('https://quotesnap-3f51.onrender.com/admin', 'quotesnap-3f51.onrender.com'), false);
  assert.equal(isOwnQuoteLink('javascript:alert(1)', 'quotesnap-3f51.onrender.com'), false);
});

test('uses is.gd when it works', async () => {
  const { f, urls } = fake([{ ok: true, status: 200, text: 'https://is.gd/a8Kq2\n' }]);
  assert.equal(await shortenUrl('https://x.test/?q=z1', f), 'https://is.gd/a8Kq2');
  assert.match(urls[0], /^https:\/\/is\.gd\/create\.php/);
});

test('falls back to TinyURL, then gives up cleanly', async () => {
  const a = fake(['throw', { ok: true, status: 200, text: 'https://tinyurl.com/2abc' }]);
  assert.equal(await shortenUrl('https://x.test/?q=z1', a.f), 'https://tinyurl.com/2abc');
  const b = fake([{ ok: false, status: 502, text: 'Error' }, { ok: true, status: 200, text: '<html>error</html>' }]);
  assert.equal(await shortenUrl('https://x.test/?q=z1', b.f), null);
});
