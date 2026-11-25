import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { PocketTtsClient } from '../src/pocket/client.js';
import { CACHE_SIZE, MESSAGES, PocketTts } from '../src/integration.js';
import { MAX_CLIP_BYTES } from '../src/wav.js';
import { CLIPS, fakeServer, json, wav } from './helpers/fakeServer.js';

const BASE = 'http://192.0.2.10:8000';
const EN = 'http://192.0.2.10:8001';

async function setup({ config = { base_url: BASE }, routes, now } = {}) {
  const gladys = createFakeGladys({ config });
  const fetch = fakeServer(routes);
  const { logger, lines } = recordingLogger();
  const tts = new PocketTts(gladys, {
    client: new PocketTtsClient({ fetch }),
    logger,
    now,
    timers: false,
  });
  registerHandlers(gladys, tts, { logger });
  await gladys.connect();
  return { gladys, fetch, tts, lines };
}

function recordingLogger() {
  const lines = { info: [], warn: [], debug: [], error: [] };
  const logger = Object.fromEntries(
    Object.keys(lines).map((level) => [level, (message) => lines[level].push(String(message))]),
  );
  return { logger, lines };
}

const decoded = (ack) => {
  const [type, payload] = ack.data.audio.split(';base64,');
  return { type, audio: Buffer.from(payload, 'base64') };
};
const triggers = (gladys) => gladys.fake.sceneEvents.map((event) => event.key ?? event.type);
const refused = () => {
  throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
};

test('at startup, /health checks the server, without any synthesis', async () => {
  const { gladys, fetch, lines } = await setup();
  assert.deepEqual(
    fetch.calls.map((call) => call.url.href),
    [`${BASE}/health`],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(status.message.fr, 'Le serveur Pocket TTS répond.');
  assert.ok(lines.info.includes('The Pocket TTS server answers'));
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('without an address, the status asks for one and nothing is requested', async () => {
  const { gladys, fetch } = await setup({ config: {} });
  assert.equal(fetch.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.not_configured,
  });
  const ack = await gladys.fake.ttsSynthesize('Bonjour.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /Enter the address/);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('an address that cannot be used is said so, not taken for an empty one', async () => {
  const { gladys, fetch } = await setup({
    config: { base_url: BASE, base_url_en: 'http://user:pass@192.0.2.10:8001' },
  });
  assert.equal(fetch.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.invalid_url,
  });
});

test('a text becomes a WAV with exact sizes, spoken by the server of the language', async () => {
  const { gladys, fetch } = await setup({
    config: { base_url: BASE, base_url_en: EN, voice_en: 'alba', voice_fr: 'estelle' },
    routes: { [`${EN}/tts`]: () => wav(CLIPS.yesEn) },
  });
  assert.deepEqual(
    fetch.calls.map((call) => call.url.href),
    [`${BASE}/health`, `${EN}/health`],
  );
  assert.equal(gladys.fake.connectionStatus.message.en, 'The 2 Pocket TTS servers answer.');

  const fr = await gladys.fake.ttsSynthesize('La porte est ouverte.', 'fr-FR');
  assert.equal(fr.success, true);
  const { type, audio } = decoded(fr);
  assert.equal(type, 'audio/wav');
  assert.equal(audio.length, CLIPS.ouiFr.length);
  assert.equal(audio.readUInt32LE(40), audio.length - 44);
  assert.equal(fetch.speech().at(-1).url.href, `${BASE}/tts`);
  assert.deepEqual(fetch.speech().at(-1).form, {
    text: 'La porte est ouverte.',
    voice_url: 'estelle',
  });

  const en = await gladys.fake.ttsSynthesize('The door is open.', 'en');
  assert.equal(decoded(en).audio.length, CLIPS.yesEn.length);
  assert.equal(fetch.speech().at(-1).url.href, `${EN}/tts`);
  assert.equal(fetch.speech().at(-1).form.voice_url, 'alba');

  // German has neither a server nor a voice: the main server, its default voice.
  await gladys.fake.ttsSynthesize('Die Tür ist offen.', 'de');
  assert.equal(fetch.speech().at(-1).url.href, `${BASE}/tts`);
  assert.deepEqual(fetch.speech().at(-1).form, { text: 'Die Tür ist offen.' });
  // Unknown language: French.
  await gladys.fake.ttsSynthesize('Annonce.', null);
  assert.equal(fetch.speech().at(-1).form.voice_url, 'estelle');
});

test('the same announcement on several speakers is asked once, then served from memory', async () => {
  const { gladys, fetch, tts } = await setup();
  const acks = await Promise.all([
    gladys.fake.ttsSynthesize('Le linge est sec.', 'fr'),
    gladys.fake.ttsSynthesize('Le linge est sec.', 'fr'),
  ]);
  assert.ok(acks.every((ack) => ack.success));
  assert.equal(fetch.speech().length, 1);
  await gladys.fake.ttsSynthesize(' Le linge est sec. ', 'fr');
  assert.equal(fetch.speech().length, 1);

  for (let i = 0; i <= CACHE_SIZE; i += 1) {
    await gladys.fake.ttsSynthesize(`Texte ${i}.`, 'fr');
  }
  assert.equal(tts.cache.size, CACHE_SIZE);
  // New settings forget every clip.
  await gladys.fake.configUpdated({ base_url: BASE, voice_fr: 'cosette' });
  assert.equal(tts.cache.size, 0);
  await gladys.fake.ttsSynthesize('Le linge est sec.', 'fr');
  assert.equal(fetch.speech().at(-1).form.voice_url, 'cosette');
});

test('a server that goes down fires server_offline once, and server_online on return', async () => {
  let down = false;
  const guard = (answer) => (call) => (down ? refused() : answer(call));
  const { gladys, tts, lines } = await setup({
    routes: {
      '/health': guard(() => json('{"status":"healthy"}')),
      '/tts': guard(() => wav(CLIPS.ouiFr)),
    },
  });
  down = true;
  const ack = await gladys.fake.ttsSynthesize('Alerte.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /cannot be reached.*ECONNREFUSED/);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.unreachable,
  });
  await tts.check();
  await gladys.fake.ttsSynthesize('Alerte 2.', 'fr');
  assert.deepEqual(triggers(gladys), ['server_offline']);
  assert.equal(lines.warn.filter((l) => l.includes('is unavailable')).length, 1);

  down = false;
  await tts.check();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(triggers(gladys), ['server_offline', 'server_online']);
  assert.ok(lines.info.includes('The Pocket TTS server answers again'));
});

test('with several servers, the status names the one that fails', async () => {
  const { gladys } = await setup({
    config: { base_url: BASE, base_url_en: EN },
    routes: { [`${EN}/health`]: refused },
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(gladys.fake.connectionStatus.message.fr, `${MESSAGES.unreachable.fr} (${EN})`);
  assert.deepEqual(triggers(gladys), ['server_offline']);
});

test('something else at the address is said so', async () => {
  const { gladys } = await setup({
    routes: { '/health': () => new Response('', { status: 404 }) },
  });
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: MESSAGES.not_found });
});

test('a voice the server cannot load fails that request only: the status stays green', async () => {
  const { gladys } = await setup({
    config: { base_url: BASE, voice_en: 'hf://kyutai/tts-voices/x.wav', voice_es: 'nobody' },
    routes: {
      '/tts': (call) =>
        call.form.voice_url === 'nobody'
          ? json('{"detail":"voice_url must start with http://, https://, or hf://"}', 400)
          : call.form.voice_url
            ? new Response('Internal Server Error', { status: 500 })
            : wav(CLIPS.ouiFr),
    },
  });
  const en = await gladys.fake.ttsSynthesize('Hello.', 'en');
  assert.equal(en.success, false);
  assert.match(en.error, /cannot load this voice.*HTTP 500/);
  const es = await gladys.fake.ttsSynthesize('Hola.', 'es');
  assert.match(es.error, /built-in name.*voice_url must start with/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal((await gladys.fake.ttsSynthesize('Bonjour.', 'fr')).success, true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a synthesis that runs out of time does not call the server offline', async () => {
  const { gladys } = await setup({
    routes: {
      '/tts': () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    },
  });
  const ack = await gladys.fake.ttsSynthesize('Un très long texte.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /keep announcements short/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a clip over 5 MB is resampled, and still accepted by the SDK', async () => {
  // 120 s of sound at 24 kHz: 5.76 MB.
  const header = Buffer.from(CLIPS.ouiFr.subarray(0, 44));
  const long = Buffer.concat([header, Buffer.alloc(24000 * 2 * 120)]);
  const { gladys } = await setup({ routes: { '/tts': () => wav(long) } });
  const ack = await gladys.fake.ttsSynthesize('Long.', 'fr');
  assert.equal(ack.success, true);
  const { audio } = decoded(ack);
  assert.ok(audio.length <= MAX_CLIP_BYTES);
  assert.equal(audio.readUInt32LE(24), 16000);
});

test('a text with nothing to say fails without a request', async () => {
  const { gladys, fetch } = await setup();
  const ack = await gladys.fake.ttsSynthesize(' *** ', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /nothing to say/);
  assert.equal(fetch.speech().length, 0);
});

test('a normal synthesis writes nothing at info level, and never the text', async () => {
  const { gladys, tts, lines } = await setup();
  const before = lines.info.length;
  await gladys.fake.ttsSynthesize('Code du portail 1234.', 'fr');
  await gladys.fake.ttsSynthesize('Code du portail 1234.', 'fr');
  await tts.check();
  assert.equal(lines.info.length, before);
  assert.equal(lines.warn.length, 0);
  assert.doesNotMatch(Object.values(lines).flat().join('\n'), /portail/);
});

test('"Test the voice" really asks the server, in the language chosen', async () => {
  let clock = 0;
  const { gladys, fetch } = await setup({
    config: { base_url: BASE, voice_es: 'lola' },
    now: () => clock,
    routes: {
      '/tts': () => {
        clock += 1500;
        return wav(CLIPS.sampleFr);
      },
    },
  });
  const ack = await gladys.fake.action('test_voice', { language: 'es' });
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /en espagnol avec la voix « lola » : 3,7 s de son en 1,5 s/);
  assert.match(
    ack.data.message.en,
    /in Spanish with the voice "lola": 3\.7 s of sound made in 1\.5 s/,
  );
  assert.equal(
    fetch.speech().at(-1).form.text,
    'Hola, soy Gladys. La puerta del garaje está abierta.',
  );
  // Without a language: French, the default voice. A second press asks again.
  const fr = await gladys.fake.action('test_voice', {});
  assert.match(fr.data.message.fr, /la voix par défaut du serveur/);
  await gladys.fake.action('test_voice');
  assert.equal(fetch.speech().length, 3);
});

test('"Test the voice" fails in red, in four languages, when the server is down', async () => {
  const { gladys } = await setup({ routes: { '/tts': refused } });
  const ack = await gladys.fake.action('test_voice', { language: 'fr' });
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /^Le serveur Pocket TTS est injoignable.*ECONNREFUSED/);
  assert.match(ack.error.de, /nicht erreichbar/);
});

test('"Show the voices" gives the voices recorded in the language, and all of them', async () => {
  const { gladys, fetch } = await setup();
  const calls = fetch.calls.length;
  const fr = await gladys.fake.action('list_voices', { language: 'fr' });
  assert.equal(fr.success, true);
  assert.match(fr.data.message.fr, /^Enregistrées en français : estelle\. Chacune des 27 voix/);
  const all = await gladys.fake.action('list_voices', {});
  assert.match(all.data.message.en, /^Built-in voices: estelle, juergen, lola, alba, /);
  assert.equal(fetch.calls.length, calls);
});

test('a request arriving before the configuration is read waits for it', async () => {
  const gladys = createFakeGladys({ config: { base_url: BASE, voice_fr: 'marius' } });
  const fetch = fakeServer();
  const tts = new PocketTts(gladys, {
    client: new PocketTtsClient({ fetch }),
    logger: recordingLogger().logger,
    timers: false,
  });
  const clip = await tts.handleSynthesize('Salut.', 'fr');
  assert.match(clip, /^audio\/wav;base64,/);
  assert.equal(fetch.speech().at(-1).form.voice_url, 'marius');
});
