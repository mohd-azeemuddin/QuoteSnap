import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWavBase64 } from '../audio.ts';

test('wraps raw PCM in a WAV header using the sample rate from the mime type', () => {
  const pcm = Buffer.alloc(4800, 1).toString('base64');
  const wav = Buffer.from(toWavBase64(pcm, 'audio/L16;codec=pcm;rate=24000'), 'base64');
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 4800);
  assert.equal(wav.length, 44 + 4800);
});

test('leaves real WAV data unchanged', () => {
  const already = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40)]).toString('base64');
  assert.equal(toWavBase64(already, 'audio/wav'), already);
});
