// -----------------------------------------------------------------------------
// The WAV clips of Pocket TTS, made fit for Gladys.
//
// Pocket TTS streams its WAV while it speaks, so it writes the header before
// knowing the length: the RIFF and `data` sizes claim about 2 GB. Some players
// trust them (and wait for the rest, or refuse the file): the sizes are
// rewritten from the bytes really received.
//
// The clip is 16-bit mono PCM at 24 kHz, 48 KB per second: Gladys refuses a
// clip over 5 MB (about 100 seconds). A longer one is resampled to a lower
// rate, which keeps speech clear down to 12 kHz.
// -----------------------------------------------------------------------------

// What Gladys accepts (5 MB decoded).
export const MAX_CLIP_BYTES = 5 * 1000 * 1000;
// Rates tried, in order, for a clip over MAX_CLIP_BYTES.
export const FALLBACK_RATES = [16000, 12000, 8000];

/**
 * Parse a WAV file and fix its sizes.
 * @param {Buffer} wav - The bytes received.
 * @returns {{format: number, channels: number, sampleRate: number, bitsPerSample: number, data: Buffer}|null}
 *   The PCM data really present, null when the bytes are not a WAV with sound.
 * @example
 * readWav(buffer).sampleRate; // 24000
 */
export function readWav(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < 12) {
    return null;
  }
  if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.toString('latin1', 8, 12) !== 'WAVE') {
    return null;
  }
  let fmt = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('latin1', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && start + 16 <= wav.length) {
      fmt = {
        format: wav.readUInt16LE(start),
        channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4),
        bitsPerSample: wav.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      if (!fmt || fmt.channels < 1 || fmt.bitsPerSample < 8) {
        return null;
      }
      // The declared size, or what arrived when the header lies.
      const blockAlign = fmt.channels * (fmt.bitsPerSample / 8);
      let length = Math.min(size, wav.length - start);
      length -= length % blockAlign;
      if (length <= 0) {
        return null;
      }
      return { ...fmt, data: wav.subarray(start, start + length) };
    }
    // Chunks are padded to an even size.
    offset = start + size + (size % 2);
  }
  return null;
}

/**
 * A WAV file of PCM data, with exact sizes.
 * @param {{format: number, channels: number, sampleRate: number, bitsPerSample: number, data: Buffer}} pcm - The sound.
 * @returns {Buffer} The file.
 */
export function writeWav({ format, channels, sampleRate, bitsPerSample, data }) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * (bitsPerSample / 8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(format, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Resample 16-bit mono PCM to a lower rate. Each output sample averages the
 * input samples it covers (a box filter: enough against the aliasing of a
 * downsampling of speech).
 * @param {Buffer} data - 16-bit little-endian mono samples.
 * @param {number} from - Their rate.
 * @param {number} to - The rate wanted, lower.
 * @returns {Buffer} The resampled samples.
 */
export function downsample(data, from, to) {
  const input = data.length / 2;
  const output = Math.floor((input * to) / from);
  const result = Buffer.alloc(output * 2);
  const step = from / to;
  for (let i = 0; i < output; i += 1) {
    const first = Math.floor(i * step);
    const last = Math.max(first + 1, Math.min(input, Math.floor((i + 1) * step)));
    let sum = 0;
    for (let j = first; j < last; j += 1) {
      sum += data.readInt16LE(j * 2);
    }
    result.writeInt16LE(Math.round(sum / (last - first)), i * 2);
  }
  return result;
}

/**
 * The clip Gladys gets: sizes fixed, and resampled when over MAX_CLIP_BYTES.
 * @param {Buffer} wav - What Pocket TTS answered.
 * @param {number} [max] - The size limit.
 * @returns {{audio: Buffer, sampleRate: number, seconds: number, resampled: boolean}|null}
 *   The clip; null when the bytes are not a WAV with sound.
 * @throws {RangeError} When even the lowest rate is over the limit.
 */
export function fitWav(wav, max = MAX_CLIP_BYTES) {
  const pcm = readWav(wav);
  if (!pcm) {
    return null;
  }
  const bytesPerSecond = pcm.sampleRate * pcm.channels * (pcm.bitsPerSample / 8);
  const seconds = pcm.data.length / bytesPerSecond;
  let audio = writeWav(pcm);
  if (audio.length <= max) {
    return { audio, sampleRate: pcm.sampleRate, seconds, resampled: false };
  }
  // Only the format Pocket TTS writes is resampled.
  if (pcm.format === 1 && pcm.channels === 1 && pcm.bitsPerSample === 16) {
    for (const rate of FALLBACK_RATES.filter((r) => r < pcm.sampleRate)) {
      audio = writeWav({
        ...pcm,
        sampleRate: rate,
        data: downsample(pcm.data, pcm.sampleRate, rate),
      });
      if (audio.length <= max) {
        return { audio, sampleRate: rate, seconds, resampled: true };
      }
    }
  }
  throw new RangeError(`${seconds.toFixed(0)} s of audio do not fit in ${max} bytes`);
}
