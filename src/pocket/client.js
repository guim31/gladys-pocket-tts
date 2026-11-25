// -----------------------------------------------------------------------------
// Client of the HTTP server of Pocket TTS (`pocket-tts serve`, Python or the
// standalone binary, same API):
//
//   POST <base>/tts      form `text`, `voice_url`? -> WAV, streamed as spoken
//   GET  <base>/health   -> {"status": "healthy"}
//
// `voice_url` is a built-in voice name (estelle, alba…) or an audio file to
// clone (hf://, https://); absent, the server speaks with its default voice.
// Errors are FastAPI's `{detail}`. The text never reaches a log line or an
// error message (a 422 can echo it in `detail[].input`: only `msg` is read).
// -----------------------------------------------------------------------------

import { fitWav } from '../wav.js';

// Gladys waits 30 s for the clip: keep a margin for the relay.
export const SPEECH_TIMEOUT_MS = 25_000;
// The periodic check.
export const HEALTH_TIMEOUT_MS = 10_000;
// Longest server message kept in an error.
const MAX_DETAIL = 160;

export class SpeechError extends Error {
  /**
   * @param {'not_configured'|'unreachable'|'timeout'|'not_found'|'rejected'|'voice_failed'|'server'|'invalid_response'|'too_long'} kind - What failed.
   * @param {string} message - Technical detail, for the logs.
   * @param {{status?: number, detail?: string, cause?: unknown}} [options]
   */
  constructor(kind, message, { status, detail, cause } = {}) {
    super(message, { cause });
    this.name = 'SpeechError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The message of an error body: FastAPI's `{detail}` (a text, or a list of
 * `{msg}` whose `input` is never read).
 * @param {Buffer} body - The answer.
 * @returns {string} The message, shortened, or ''.
 */
export function errorDetail(body) {
  let json;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch {
    return '';
  }
  const detail = json?.detail;
  const found =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail
            .map((item) => item?.msg)
            .filter((msg) => typeof msg === 'string')
            .join('; ')
        : '';
  const flat = found.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

export class PocketTtsClient {
  /**
   * @param {object} [deps]
   * @param {typeof fetch} [deps.fetch] - Injectable for tests.
   * @param {number} [deps.speechTimeoutMs] - Bound of one synthesis.
   * @param {number} [deps.healthTimeoutMs] - Bound of a check.
   */
  constructor({
    fetch: fetchImpl = globalThis.fetch,
    speechTimeoutMs = SPEECH_TIMEOUT_MS,
    healthTimeoutMs = HEALTH_TIMEOUT_MS,
  } = {}) {
    this.fetch = fetchImpl;
    this.speechTimeoutMs = speechTimeoutMs;
    this.healthTimeoutMs = healthTimeoutMs;
  }

  /**
   * One request to a server.
   * @param {string|null} baseUrl - The server.
   * @param {string} path - `/tts` or `/health`.
   * @param {{form?: URLSearchParams, timeoutMs: number, voice?: string}} options - The form (POST), the bound, the voice asked.
   * @returns {Promise<{response: Response, body: Buffer}>} A 2xx answer.
   * @throws {SpeechError} On any failure.
   */
  async request(baseUrl, path, { form, timeoutMs, voice = '' }) {
    if (!baseUrl) {
      throw new SpeechError('not_configured', 'no server address configured');
    }
    let response;
    let data;
    try {
      response = await this.fetch(`${baseUrl}${path}`, {
        method: form ? 'POST' : 'GET',
        headers: form
          ? {
              Accept: 'audio/wav, application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            }
          : { Accept: 'application/json' },
        body: form ? form.toString() : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Inside the try: the timeout also covers a stream that stalls.
      data = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new SpeechError('timeout', `${path}: no answer within ${timeoutMs} ms`, {
          cause: err,
        });
      }
      const reason = err?.cause?.code ?? err?.message ?? String(err);
      throw new SpeechError('unreachable', `${path}: request failed (${reason})`, { cause: err });
    }
    if (!response.ok) {
      const { status } = response;
      const detail = errorDetail(data);
      // A voice the server cannot load (a missing file, an address it cannot
      // reach) is a 500 without detail: say "voice" when one was asked.
      const kind =
        status === 404
          ? 'not_found'
          : status === 500 && voice
            ? 'voice_failed'
            : status >= 500
              ? 'server'
              : 'rejected';
      const suffix = detail ? `: ${detail}` : '';
      throw new SpeechError(kind, `${path}: HTTP ${status}${suffix}`, { status, detail });
    }
    return { response, body: data };
  }

  /**
   * Speak a text.
   * @param {{baseUrl: string|null, voice: string}} route - The server, and the voice ('' for its default).
   * @param {string} text - What to say.
   * @returns {Promise<{audio: Buffer, type: 'audio/wav', seconds: number, sampleRate: number, resampled: boolean}>} The clip.
   * @throws {SpeechError} On any failure.
   * @example
   * await client.speak({ baseUrl: 'http://192.0.2.10:8000', voice: 'estelle' }, 'Bonjour.');
   */
  async speak({ baseUrl, voice }, text) {
    const form = new URLSearchParams({ text });
    if (voice) {
      form.set('voice_url', voice);
    }
    const { response, body } = await this.request(baseUrl, '/tts', {
      form,
      voice,
      timeoutMs: this.speechTimeoutMs,
    });
    let clip;
    try {
      clip = fitWav(body);
    } catch (err) {
      throw new SpeechError('too_long', `/tts: ${err.message}`, { cause: err });
    }
    if (!clip) {
      const announced = response.headers.get('content-type') ?? 'no content type';
      throw new SpeechError(
        'invalid_response',
        `/tts: expected a WAV with sound, got "${announced}" (${body.length} bytes)`,
      );
    }
    return { ...clip, type: 'audio/wav' };
  }

  /**
   * Whether a server answers as Pocket TTS does.
   * @param {string} baseUrl - The server.
   * @returns {Promise<void>}
   * @throws {SpeechError} When it does not answer, or not as Pocket TTS.
   */
  async health(baseUrl) {
    const { body } = await this.request(baseUrl, '/health', { timeoutMs: this.healthTimeoutMs });
    let json;
    try {
      json = JSON.parse(body.toString('utf8'));
    } catch {
      json = null;
    }
    if (json?.status !== 'healthy') {
      throw new SpeechError('invalid_response', '/health: not the answer of Pocket TTS');
    }
  }
}
