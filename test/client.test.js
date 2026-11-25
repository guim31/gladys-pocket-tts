import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PocketTtsClient, errorDetail } from '../src/pocket/client.js';
import { CLIPS, ERRORS, fakeServer, json, wav } from './helpers/fakeServer.js';

const BASE = 'http://192.0.2.10:8000';

test('a speech request is the form of the web page of Pocket TTS', async () => {
  const fetch = fakeServer();
  const clip = await new PocketTtsClient({ fetch }).speak(
    { baseUrl: BASE, voice: 'estelle' },
    'Oui.',
  );
  assert.equal(clip.type, 'audio/wav');
  assert.equal(clip.audio.readUInt32LE(40), CLIPS.ouiFr.length - 44);
  const [call] = fetch.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.href, `${BASE}/tts`);
  assert.equal(call.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(call.form, { text: 'Oui.', voice_url: 'estelle' });
  assert.ok(call.signal instanceof AbortSignal);
});

test('without a voice, none is sent: the server speaks with its default one', async () => {
  const fetch = fakeServer();
  await new PocketTtsClient({ fetch }).speak({ baseUrl: BASE, voice: '' }, 'Oui.');
  assert.deepEqual(fetch.calls[0].form, { text: 'Oui.' });
});

test('the real errors of Pocket TTS keep their message, never the text', async () => {
  const cases = [
    [json(ERRORS.badVoice, 400), 'rejected', /voice_url must start with/],
    [json(ERRORS.empty, 400), 'rejected', /Text cannot be empty/],
    [json(ERRORS.missing, 422), 'rejected', /x-www-form-urlencoded/],
    [new Response('', { status: 404 }), 'not_found', /HTTP 404$/],
    [new Response('Internal Server Error', { status: 503 }), 'server', /HTTP 503$/],
  ];
  for (const [response, kind, message] of cases) {
    const fetch = fakeServer({ '/tts': () => response });
    const err = await new PocketTtsClient({ fetch })
      .speak({ baseUrl: BASE, voice: '' }, 'Secret 1234.')
      .catch((e) => e);
    assert.equal(err.kind, kind);
    assert.match(err.message, message);
    assert.doesNotMatch(err.message, /Secret/);
  }
});

test('a 500 when a voice is asked is a voice the server cannot load', async () => {
  const fetch = fakeServer({
    '/tts': () => new Response('Internal Server Error', { status: 500 }),
  });
  const client = new PocketTtsClient({ fetch });
  const voice = await client
    .speak({ baseUrl: BASE, voice: 'hf://kyutai/tts-voices/x.wav' }, 'Oui.')
    .catch((e) => e);
  assert.equal(voice.kind, 'voice_failed');
  const plain = await client.speak({ baseUrl: BASE, voice: '' }, 'Oui.').catch((e) => e);
  assert.equal(plain.kind, 'server');
});

test('a 422 detail list keeps the messages, never the input it echoes', () => {
  const body = Buffer.from('{"detail":[{"msg":"Field required","input":"Secret 1234"}]}');
  assert.equal(errorDetail(body), 'Field required');
  assert.equal(errorDetail(Buffer.from('not json')), '');
});

test('an answer that is no WAV is an invalid response; a refused connection, unreachable', async () => {
  const html = fakeServer({
    '/tts': () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  });
  const invalid = await new PocketTtsClient({ fetch: html })
    .speak({ baseUrl: BASE, voice: '' }, 'Oui.')
    .catch((e) => e);
  assert.equal(invalid.kind, 'invalid_response');
  assert.match(invalid.message, /text\/html/);
  const refused = async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  const down = await new PocketTtsClient({ fetch: refused }).health(BASE).catch((e) => e);
  assert.equal(down.kind, 'unreachable');
  assert.match(down.message, /ECONNREFUSED/);
  const none = await new PocketTtsClient({ fetch: refused })
    .speak({ baseUrl: null, voice: '' }, 'x')
    .catch((e) => e);
  assert.equal(none.kind, 'not_configured');
});

test('a synthesis that runs out of time is a timeout', async () => {
  const fetch = async (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  const err = await new PocketTtsClient({ fetch, speechTimeoutMs: 20 })
    .speak({ baseUrl: BASE, voice: '' }, 'Long.')
    .catch((e) => e);
  assert.equal(err.kind, 'timeout');
});

test('health accepts the answer of Pocket TTS only', async () => {
  const client = new PocketTtsClient({ fetch: fakeServer() });
  await client.health(BASE);
  const other = new PocketTtsClient({
    fetch: fakeServer({ '/health': () => json('{"ok":true}') }),
  });
  assert.equal((await other.health(BASE).catch((e) => e)).kind, 'invalid_response');
  const html = new PocketTtsClient({ fetch: fakeServer({ '/health': () => wav('<html>') }) });
  assert.equal((await html.health(BASE).catch((e) => e)).kind, 'invalid_response');
});
