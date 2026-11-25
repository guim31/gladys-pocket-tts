// -----------------------------------------------------------------------------
// Configuration: defaults (mirrors the manifest), normalization, and the choice
// of the server and voice for the language of a request.
//
// A Pocket TTS server loads ONE language model (`pocket-tts serve --language
// french`): the main server speaks every language, unless a language has a
// server of its own.
// -----------------------------------------------------------------------------

// Languages of the Gladys interface, the ones a server and a voice can be set for.
export const LANGUAGES = ['fr', 'en', 'de', 'es'];

// Language spoken when Gladys gives none (an announcement on an instance
// without administrator): the default of Guilhem's integrations.
export const FALLBACK_LANGUAGE = 'fr';

export const DEFAULT_CONFIG = Object.freeze({
  base_url: '',
  base_url_fr: '',
  base_url_en: '',
  base_url_de: '',
  base_url_es: '',
  voice_fr: '',
  voice_en: '',
  voice_de: '',
  voice_es: '',
});

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The address of a server, as `http(s)://host[:port][/path]` without a
 * trailing slash. A bare `host:port` gets `http://`.
 * @param {unknown} value - What the administrator typed.
 * @returns {string|null} The URL, null when empty or invalid.
 * @example
 * normalizeBaseUrl('192.0.2.10:8000/'); // 'http://192.0.2.10:8000'
 */
export function normalizeBaseUrl(value) {
  let raw = text(value);
  if (raw === '') {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return null;
  }
  // `/tts` pasted from the documentation of Pocket TTS: the address is the server.
  const path = url.pathname.replace(/\/+$/, '').replace(/\/tts$/, '');
  return `${url.origin}${path}`;
}

/**
 * Normalize the raw configuration sent by Gladys.
 * @param {Record<string, unknown>} [raw] - Values from the configuration form.
 * @returns {{baseUrl: string|null, servers: Record<string, string|null>, invalid: string[], voices: Record<string, string>}}
 *   `servers`: each language's own server, null when it uses the main one;
 *   `invalid`: the keys holding something typed that is not a usable address.
 * @example
 * normalizeConfig({ base_url: 'tts.lan:8000' }).baseUrl; // 'http://tts.lan:8000'
 */
export function normalizeConfig(raw = {}) {
  const value = raw ?? {};
  const invalid = [];
  const address = (key) => {
    const url = normalizeBaseUrl(value[key]);
    if (url === null && text(value[key]) !== '') {
      invalid.push(key);
    }
    return url;
  };
  return {
    baseUrl: address('base_url'),
    servers: Object.fromEntries(LANGUAGES.map((lang) => [lang, address(`base_url_${lang}`)])),
    invalid,
    voices: Object.fromEntries(LANGUAGES.map((lang) => [lang, text(value[`voice_${lang}`])])),
  };
}

/**
 * The language of a request, as one of LANGUAGES: `fr-FR`, `FR` and `fr_FR`
 * are `fr`; unknown or another language gives the fallback.
 * @param {unknown} language - Language Gladys sent, null when unknown.
 * @returns {string} A code of LANGUAGES.
 */
export function requestLanguage(language) {
  if (typeof language !== 'string') {
    return FALLBACK_LANGUAGE;
  }
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.includes(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * The server and voice that speak a language. The voice of the language goes
 * with its own server; on the main server, an empty voice leaves the server's
 * default voice (the one of its language model).
 * @param {{baseUrl: string|null, servers: Record<string, string|null>, voices: Record<string, string>}} settings - Normalized settings.
 * @param {string} language - A code of LANGUAGES.
 * @returns {{baseUrl: string|null, voice: string}} Where, and the voice ('' for the server's default).
 * @example
 * routeFor({ baseUrl: 'http://a:8000', servers: { en: null }, voices: { en: 'alba' } }, 'en');
 * // { baseUrl: 'http://a:8000', voice: 'alba' }
 */
export function routeFor(settings, language) {
  return {
    baseUrl: serverFor(settings, language),
    voice: settings.voices[language] ?? '',
  };
}

/**
 * The server of a language: its own, else the main one, else (no main server)
 * the first language server set, French first.
 * @param {{baseUrl: string|null, servers: Record<string, string|null>}} settings - Normalized settings.
 * @param {string} language - A code of LANGUAGES.
 * @returns {string|null} The address, null when no server is set at all.
 */
export function serverFor(settings, language) {
  return (
    settings.servers[language] ??
    settings.baseUrl ??
    LANGUAGES.map((lang) => settings.servers[lang]).find(Boolean) ??
    null
  );
}

/**
 * Every distinct server of the configuration, with the languages it speaks.
 * @param {{baseUrl: string|null, servers: Record<string, string|null>}} settings - Normalized settings.
 * @returns {Array<{baseUrl: string, languages: string[]}>} The main server first (it may speak no language left).
 */
export function serversOf(settings) {
  const byUrl = new Map();
  if (settings.baseUrl) {
    byUrl.set(settings.baseUrl, []);
  }
  for (const lang of LANGUAGES) {
    const url = serverFor(settings, lang);
    if (url) {
      if (!byUrl.has(url)) {
        byUrl.set(url, []);
      }
      byUrl.get(url).push(lang);
    }
  }
  return [...byUrl].map(([baseUrl, languages]) => ({ baseUrl, languages }));
}
