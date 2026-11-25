import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeBaseUrl,
  normalizeConfig,
  requestLanguage,
  routeFor,
  serversOf,
} from '../src/config.js';

test('the server address gets a scheme when missing, and loses its trailing slash and /tts', () => {
  assert.equal(normalizeBaseUrl('192.0.2.10:8000'), 'http://192.0.2.10:8000');
  assert.equal(normalizeBaseUrl(' http://192.0.2.10:8000/ '), 'http://192.0.2.10:8000');
  assert.equal(normalizeBaseUrl('http://192.0.2.10:8000/tts'), 'http://192.0.2.10:8000');
  assert.equal(normalizeBaseUrl('https://tts.example/pocket/'), 'https://tts.example/pocket');
});

test('an empty, invalid or credential-bearing address is no address', () => {
  assert.equal(normalizeBaseUrl(''), null);
  assert.equal(normalizeBaseUrl(undefined), null);
  assert.equal(normalizeBaseUrl('ftp://192.0.2.10'), null);
  assert.equal(normalizeBaseUrl('http://user:pass@192.0.2.10:8000'), null);
  assert.equal(normalizeBaseUrl('http://[::1'), null);
});

test('defaults: no server, the default voice of the server', () => {
  const settings = normalizeConfig(DEFAULT_CONFIG);
  assert.equal(settings.baseUrl, null);
  assert.deepEqual(settings.voices, { fr: '', en: '', de: '', es: '' });
  assert.deepEqual(settings.invalid, []);
  assert.equal(normalizeConfig(null).baseUrl, null);
  assert.deepEqual(normalizeConfig({ base_url_en: 'ftp://x' }).invalid, ['base_url_en']);
});

test('the language of a request is one of the four of Gladys, French otherwise', () => {
  assert.equal(requestLanguage('en'), 'en');
  assert.equal(requestLanguage('de-DE'), 'de');
  assert.equal(requestLanguage('ES_es'), 'es');
  assert.equal(requestLanguage('it'), 'fr');
  assert.equal(requestLanguage(null), 'fr');
});

test('a language speaks on its own server, else the main one, with its voice', () => {
  const settings = normalizeConfig({
    base_url: 'http://192.0.2.10:8000',
    base_url_en: '192.0.2.10:8001',
    voice_en: ' alba ',
    voice_fr: 'estelle',
  });
  assert.deepEqual(routeFor(settings, 'en'), { baseUrl: 'http://192.0.2.10:8001', voice: 'alba' });
  assert.deepEqual(routeFor(settings, 'fr'), {
    baseUrl: 'http://192.0.2.10:8000',
    voice: 'estelle',
  });
  assert.deepEqual(routeFor(settings, 'de'), { baseUrl: 'http://192.0.2.10:8000', voice: '' });
  assert.deepEqual(serversOf(settings), [
    { baseUrl: 'http://192.0.2.10:8000', languages: ['fr', 'de', 'es'] },
    { baseUrl: 'http://192.0.2.10:8001', languages: ['en'] },
  ]);
});

test('without a main server, the first language server speaks the others, French first', () => {
  const settings = normalizeConfig({
    base_url_es: 'http://192.0.2.11:8000',
    base_url_en: 'http://192.0.2.12:8000',
  });
  assert.equal(routeFor(settings, 'fr').baseUrl, 'http://192.0.2.12:8000');
  assert.equal(routeFor(settings, 'es').baseUrl, 'http://192.0.2.11:8000');
  assert.equal(routeFor(normalizeConfig({}), 'fr').baseUrl, null);
  assert.deepEqual(serversOf(normalizeConfig({})), []);
});
