import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, fitWav, readWav, writeWav } from '../src/wav.js';
import { CLIPS } from './helpers/fakeServer.js';

test('the streamed header of Pocket TTS claims 2 GB: the real sizes are written', () => {
  const streamed = CLIPS.ouiFr;
  assert.equal(streamed.readUInt32LE(40), 2_000_000_000);
  const pcm = readWav(streamed);
  assert.equal(pcm.sampleRate, 24000);
  assert.equal(pcm.channels, 1);
  assert.equal(pcm.bitsPerSample, 16);
  assert.equal(pcm.data.length, streamed.length - 44);
  const clip = fitWav(streamed);
  assert.equal(clip.resampled, false);
  assert.equal(clip.audio.readUInt32LE(4), clip.audio.length - 8);
  assert.equal(clip.audio.readUInt32LE(40), clip.audio.length - 44);
  assert.ok(clip.seconds > 0.5 && clip.seconds < 2, `${clip.seconds} s`);
});

test('bytes that are no WAV with sound give nothing', () => {
  assert.equal(readWav(Buffer.from('{"detail":"x"}')), null);
  assert.equal(readWav(CLIPS.ouiFr.subarray(0, 44)), null);
  assert.equal(fitWav(Buffer.alloc(3)), null);
});

test('an odd byte at the end of a cut stream is dropped', () => {
  const cut = CLIPS.ouiFr.subarray(0, 1001);
  assert.equal(readWav(cut).data.length, 1001 - 44 - 1);
});

test('a clip over the limit is resampled to the first rate that fits', () => {
  const limit = Math.ceil(CLIPS.sampleFr.length * 0.6);
  const clip = fitWav(CLIPS.sampleFr, limit);
  assert.equal(clip.resampled, true);
  assert.equal(clip.sampleRate, 12000);
  assert.ok(clip.audio.length <= limit);
  assert.equal(readWav(clip.audio).sampleRate, 12000);
  // Same duration.
  assert.ok(Math.abs(readWav(clip.audio).data.length / 24000 - clip.seconds) < 0.01);
  assert.throws(() => fitWav(CLIPS.sampleFr, 1000), RangeError);
});

test('downsampling averages the samples it covers', () => {
  const data = Buffer.alloc(8);
  [100, 300, -200, -400].forEach((value, i) => data.writeInt16LE(value, i * 2));
  const half = downsample(data, 24000, 12000);
  assert.deepEqual([half.readInt16LE(0), half.readInt16LE(2)], [200, -300]);
  const wav = writeWav({
    format: 1,
    channels: 1,
    sampleRate: 12000,
    bitsPerSample: 16,
    data: half,
  });
  assert.equal(wav.length, 48);
});
