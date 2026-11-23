/**
 * Gemini text-to-speech returns raw 16-bit PCM (e.g. "audio/L16;codec=pcm;rate=24000"),
 * which browsers can't play. Wrap it in a WAV header so <audio> and Gemini both accept it.
 */
export function toWavBase64(base64: string, mimeType = ''): string {
  const pcm = Buffer.from(base64, 'base64');
  if (pcm.subarray(0, 4).toString('ascii') === 'RIFF') return base64; // already WAV
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1]) || 24000;
  const channels = 1;
  const bits = 16;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE((rate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString('base64');
}
