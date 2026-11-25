// A fetch that answers like the Pocket TTS server, from its real answers
// (test/fixtures/pocket-tts, captured from `pocket-tts serve` 3.3.0), and
// records every request. `routes` overrides an endpoint: `(call) => Response`.

import { readFile } from 'node:fs/promises';

const fixture = (path) => readFile(new URL(`../fixtures/pocket-tts/${path}`, import.meta.url));

// As streamed: the header claims about 2 GB of data.
export const CLIPS = {
  ouiFr: await fixture('oui-fr.wav'),
  yesEn: await fixture('yes-en.wav'),
  sampleFr: await fixture('sample-fr.wav'),
};
export const ERRORS = {
  empty: await fixture('empty.json'),
  badVoice: await fixture('badvoice.json'),
  missing: await fixture('missing.json'),
};

export const json = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

export const wav = (body) =>
  new Response(body, { status: 200, headers: { 'content-type': 'audio/wav' } });

/**
 * @param {Record<string, (call: object) => Response|Promise<Response>>} [routes] - Answer per `origin + path`, or per path.
 * @returns {typeof fetch & {calls: object[], speech: () => object[]}} The fake.
 */
export function fakeServer(routes = {}) {
  const answers = {
    '/health': () => json('{"status":"healthy"}'),
    '/tts': () => wav(CLIPS.ouiFr),
    ...routes,
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const form = init.body ? new URLSearchParams(init.body) : null;
    const call = {
      url: parsed,
      path: parsed.pathname,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      form: form ? Object.fromEntries(form) : null,
      signal: init.signal,
    };
    calls.push(call);
    const answer = answers[`${parsed.origin}${call.path}`] ?? answers[call.path];
    return answer ? answer(call) : new Response('', { status: 404 });
  };
  fetch.calls = calls;
  fetch.speech = () => calls.filter((call) => call.path.endsWith('/tts'));
  return fetch;
}

/** A logger that records, by level. */
export function recordingLogger() {
  const lines = { info: [], warn: [], debug: [], error: [] };
  const logger = Object.fromEntries(
    Object.keys(lines).map((level) => [level, (message) => lines[level].push(String(message))]),
  );
  return { logger, lines };
}
