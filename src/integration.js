// -----------------------------------------------------------------------------
// PocketTts: everything the SDK handlers of src/app.js call.
//
// - applyConfig(): takes the settings, then checks every server (`/health`,
//   never a synthesis), shown as the status in Supervision. Repeated every 5
//   minutes, so the scene triggers `server_offline` / `server_online` follow
//   the servers. Never throws.
// - handleSynthesize(): turns a text Gladys wants spoken into a clip. Throwing
//   acks the command as failed: the scene action fails visibly.
// - testVoice(), listVoices(): the buttons of the configuration screen.
//
// A clip already made (same text, server and voice) is served from memory,
// and identical requests running at the same time (one announcement on
// several speakers) share one synthesis: Pocket TTS speaks one text at a time.
// -----------------------------------------------------------------------------

import { logger as defaultLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES, normalizeConfig, requestLanguage, routeFor, serversOf } from './config.js';
import { PocketTtsClient } from './pocket/client.js';

// Clips kept in memory (a WAV of 10 seconds makes about 480 KB).
export const CACHE_SIZE = 16;
// Period of the check of the servers, for the status and the scene triggers.
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// The failure a synthesis reports as the server being down. The others concern
// one request (a voice it cannot load, a text too long for the time Gladys
// waits on a processor): the periodic check tells about the server.
const SPEECH_OFFLINE_ERRORS = ['unreachable'];

export const MESSAGES = {
  not_configured: {
    en: 'Enter the address of the Pocket TTS server in the configuration, then save.',
    fr: "Saisissez l'adresse du serveur Pocket TTS dans la configuration, puis enregistrez.",
    de: 'Gib die Adresse des Pocket-TTS-Servers in der Konfiguration ein und speichere.',
    es: 'Introduzca la dirección del servidor Pocket TTS en la configuración y guarde.',
  },
  invalid_url: {
    en: 'A server address is not valid: http:// or https://, without user name or password.',
    fr: "Une adresse de serveur n'est pas valide : http:// ou https://, sans nom d'utilisateur ni mot de passe.",
    de: 'Eine Serveradresse ist ungültig: http:// oder https://, ohne Benutzername und Passwort.',
    es: 'Una dirección de servidor no es válida: http:// o https://, sin nombre de usuario ni contraseña.',
  },
  unreachable: {
    en: 'The Pocket TTS server cannot be reached: check its address and that it is running.',
    fr: "Le serveur Pocket TTS est injoignable : vérifiez son adresse et qu'il est démarré.",
    de: 'Der Pocket-TTS-Server ist nicht erreichbar: Prüfe seine Adresse und ob er läuft.',
    es: 'No se puede acceder al servidor Pocket TTS: compruebe su dirección y que esté en marcha.',
  },
  timeout: {
    en: 'The Pocket TTS server does not answer in time: keep announcements short (Gladys waits 30 seconds).',
    fr: 'Le serveur Pocket TTS ne répond pas à temps : gardez des annonces courtes (Gladys attend 30 secondes).',
    de: 'Der Pocket-TTS-Server antwortet nicht rechtzeitig: Halte Durchsagen kurz (Gladys wartet 30 Sekunden).',
    es: 'El servidor Pocket TTS no responde a tiempo: mantenga los anuncios cortos (Gladys espera 30 segundos).',
  },
  not_found: {
    en: 'No Pocket TTS server at this address: check the port (8000 by default) and remove any path.',
    fr: 'Pas de serveur Pocket TTS à cette adresse : vérifiez le port (8000 par défaut) et retirez tout chemin.',
    de: 'Kein Pocket-TTS-Server unter dieser Adresse: Prüfe den Port (standardmäßig 8000) und entferne jeden Pfad.',
    es: 'No hay ningún servidor Pocket TTS en esta dirección: compruebe el puerto (8000 por defecto) y quite cualquier ruta.',
  },
  rejected: {
    en: 'The Pocket TTS server refuses the request: a voice is a built-in name (estelle, alba…) or an hf:// or https:// address.',
    fr: 'Le serveur Pocket TTS refuse la requête : une voix est un nom intégré (estelle, alba…) ou une adresse hf:// ou https://.',
    de: 'Der Pocket-TTS-Server lehnt die Anfrage ab: Eine Stimme ist ein eingebauter Name (estelle, alba…) oder eine hf://- oder https://-Adresse.',
    es: 'El servidor Pocket TTS rechaza la solicitud: una voz es un nombre integrado (estelle, alba…) o una dirección hf:// o https://.',
  },
  voice_failed: {
    en: 'The Pocket TTS server cannot load this voice. Cloning a voice from a file needs a Hugging Face login on the server; built-in voices always work.',
    fr: 'Le serveur Pocket TTS ne peut pas charger cette voix. Cloner une voix depuis un fichier demande une connexion Hugging Face sur le serveur ; les voix intégrées marchent toujours.',
    de: 'Der Pocket-TTS-Server kann diese Stimme nicht laden. Eine Stimme aus einer Datei zu klonen braucht eine Hugging-Face-Anmeldung auf dem Server; eingebaute Stimmen funktionieren immer.',
    es: 'El servidor Pocket TTS no puede cargar esta voz. Clonar una voz desde un archivo requiere iniciar sesión en Hugging Face en el servidor; las voces integradas siempre funcionan.',
  },
  server: {
    en: 'The Pocket TTS server is failing (server error). Check its logs.',
    fr: 'Le serveur Pocket TTS est en panne (erreur serveur). Consultez ses journaux.',
    de: 'Der Pocket-TTS-Server hat eine Störung (Serverfehler). Sieh dir seine Logs an.',
    es: 'El servidor Pocket TTS falla (error del servidor). Consulte sus registros.',
  },
  invalid_response: {
    en: 'The server at this address does not answer as Pocket TTS does (no WAV sound).',
    fr: 'Le serveur à cette adresse ne répond pas comme Pocket TTS (pas de son WAV).',
    de: 'Der Server unter dieser Adresse antwortet nicht wie Pocket TTS (kein WAV-Ton).',
    es: 'El servidor en esta dirección no responde como Pocket TTS (sin sonido WAV).',
  },
  too_long: {
    en: 'The clip is over the 5 MB Gladys accepts: split the announcement.',
    fr: 'Le clip dépasse les 5 Mo que Gladys accepte : découpez l’annonce.',
    de: 'Der Clip ist größer als die 5 MB, die Gladys annimmt: Teile die Durchsage auf.',
    es: 'El clip supera los 5 MB que acepta Gladys: divida el anuncio.',
  },
  empty: {
    en: 'There is nothing to say in the text.',
    fr: "Il n'y a rien à dire dans le texte.",
    de: 'Im Text gibt es nichts zu sagen.',
    es: 'No hay nada que decir en el texto.',
  },
};

// Sentence of the "Test the voice" button, per language.
export const SAMPLES = {
  fr: 'Bonjour, ici Gladys. La porte du garage est ouverte.',
  en: 'Hello, this is Gladys. The garage door is open.',
  de: 'Hallo, hier ist Gladys. Das Garagentor ist offen.',
  es: 'Hola, soy Gladys. La puerta del garaje está abierta.',
};

// The built-in voices of Pocket TTS 3.3 (README and `_ORIGINS_OF_PREDEFINED_VOICES`),
// by the language they were recorded in. Every model speaks with any of them,
// with the voice's accent.
export const BUILT_IN_VOICES = {
  fr: ['estelle'],
  de: ['juergen'],
  es: ['lola'],
  en: [
    'alba',
    'anna',
    'azelma',
    'bill_boerst',
    'caro_davy',
    'charles',
    'cosette',
    'eponine',
    'eve',
    'fantine',
    'george',
    'jane',
    'javert',
    'jean',
    'marius',
    'mary',
    'michael',
    'paul',
    'peter_yearsley',
    'stuart_bell',
    'vera',
  ],
  other: ['giovanni (it)', 'rafael (pt)', 'daan (nl)'],
};

const LANGUAGE_NAMES = {
  en: { fr: 'French', en: 'English', de: 'German', es: 'Spanish' },
  fr: { fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol' },
  de: { fr: 'Französisch', en: 'Englisch', de: 'Deutsch', es: 'Spanisch' },
  es: { fr: 'francés', en: 'inglés', de: 'alemán', es: 'español' },
};

const localized = (build) => Object.fromEntries(LANGUAGES.map((l) => [l, build(l)]));
const decimal = (value, lang) => {
  const text = value.toFixed(1);
  return lang === 'en' ? text : text.replace('.', ',');
};

/**
 * Status shown in Supervision once every server answered.
 * @param {number} count - How many servers.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function readyMessage(count) {
  if (count <= 1) {
    return {
      en: 'The Pocket TTS server answers.',
      fr: 'Le serveur Pocket TTS répond.',
      de: 'Der Pocket-TTS-Server antwortet.',
      es: 'El servidor Pocket TTS responde.',
    };
  }
  return {
    en: `The ${count} Pocket TTS servers answer.`,
    fr: `Les ${count} serveurs Pocket TTS répondent.`,
    de: `Die ${count} Pocket-TTS-Server antworten.`,
    es: `Los ${count} servidores Pocket TTS responden.`,
  };
}

/**
 * Answer of the "Test the voice" button.
 * @param {{language: string, voice: string, seconds: number, ms: number}} test - What was spoken.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function testMessage({ language, voice, seconds, ms }) {
  const name = (lang) => LANGUAGE_NAMES[lang][language];
  return localized((lang) => {
    const audio = decimal(seconds, lang);
    const made = decimal(ms / 1000, lang);
    const by = voice
      ? {
          en: `the voice "${voice}"`,
          fr: `la voix « ${voice} »`,
          de: `der Stimme „${voice}“`,
          es: `la voz «${voice}»`,
        }
      : {
          en: 'the default voice of the server',
          fr: 'la voix par défaut du serveur',
          de: 'der Standardstimme des Servers',
          es: 'la voz predeterminada del servidor',
        };
    return {
      en: `Test sentence spoken in ${name('en')} with ${by.en}: ${audio} s of sound made in ${made} s. Select Pocket TTS on the Artificial Intelligence page of Gladys.`,
      fr: `Phrase de test dite en ${name('fr')} avec ${by.fr} : ${audio} s de son en ${made} s. Choisissez Pocket TTS sur la page Intelligence Artificielle de Gladys.`,
      de: `Testsatz auf ${name('de')} mit ${by.de} gesprochen: ${audio} s Ton in ${made} s. Wähle Pocket TTS auf der Seite Künstliche Intelligenz von Gladys.`,
      es: `Frase de prueba dicha en ${name('es')} con ${by.es}: ${audio} s de sonido en ${made} s. Elija Pocket TTS en la página Inteligencia artificial de Gladys.`,
    }[lang];
  });
}

/**
 * Answer of the "Show the voices" button: the built-in voices.
 * @param {string|null} language - The language asked, null for all.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function voicesMessage(language) {
  const native = language ? BUILT_IN_VOICES[language] : null;
  const all = Object.values(BUILT_IN_VOICES).flat().join(', ');
  return localized((lang) => {
    if (native) {
      const own = native.join(', ');
      const languageName = LANGUAGE_NAMES[lang][language];
      const count = Object.values(BUILT_IN_VOICES).flat().length;
      return {
        en: `Recorded in ${languageName}: ${own}. Each of the ${count} built-in voices speaks every language, with its accent (no language chosen: all of them). An hf:// or https:// address clones a voice from a WAV file.`,
        fr: `Enregistrées en ${languageName} : ${own}. Chacune des ${count} voix intégrées parle toutes les langues, avec son accent (sans langue choisie : toutes). Une adresse hf:// ou https:// clone une voix depuis un fichier WAV.`,
        de: `Auf ${languageName} aufgenommen: ${own}. Jede der ${count} eingebauten Stimmen spricht jede Sprache, mit ihrem Akzent (ohne gewählte Sprache: alle). Eine hf://- oder https://-Adresse klont eine Stimme aus einer WAV-Datei.`,
        es: `Grabadas en ${languageName}: ${own}. Cada una de las ${count} voces integradas habla todos los idiomas, con su acento (sin idioma elegido: todas). Una dirección hf:// o https:// clona una voz desde un archivo WAV.`,
      }[lang];
    }
    return {
      en: `Built-in voices: ${all}. estelle is French, juergen German, lola Spanish, the others mostly English.`,
      fr: `Voix intégrées : ${all}. estelle est française, juergen allemand, lola espagnole, les autres surtout anglaises.`,
      de: `Eingebaute Stimmen: ${all}. estelle ist Französisch, juergen Deutsch, lola Spanisch, die anderen meist Englisch.`,
      es: `Voces integradas: ${all}. estelle es francesa, juergen alemán, lola española, las demás sobre todo inglesas.`,
    }[lang];
  });
}

/**
 * The message of a failure, for the administrator.
 * @param {unknown} err - Usually a SpeechError.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function describeError(err) {
  return MESSAGES[err?.kind] ?? MESSAGES.unreachable;
}

/**
 * A failure about one server, naming it when there are several.
 * @param {unknown} err - Usually a SpeechError.
 * @param {string|null} baseUrl - The server.
 * @param {boolean} several - Whether the configuration has several servers.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function serverMessage(err, baseUrl, several) {
  const message = describeError(err);
  if (!several || !baseUrl) {
    return message;
  }
  return localized((lang) => `${message[lang]} (${baseUrl})`);
}

/**
 * Actions and synthesis fail with the actionable text in four languages:
 * Gladys shows `message` in the user's language, in red.
 */
export class ActionFailure extends Error {
  /**
   * @param {{en: string, fr: string, de: string, es: string}} text - The message.
   * @param {unknown} [cause] - The failure behind it.
   */
  constructor(text, cause) {
    super(text.en, { cause });
    this.message = text;
  }
}

/**
 * The error a failed command acks: the actionable text, and the technical
 * detail in brackets.
 * @param {Error & {kind?: string}} err - The failure.
 * @returns {ActionFailure} The error to throw.
 */
function failure(err) {
  const text = describeError(err);
  return new ActionFailure(
    localized((lang) => `${text[lang]} [${err.message}]`),
    err,
  );
}

class LocalError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export class PocketTts {
  /**
   * @param {object} gladys - The SDK instance (GladysIntegration).
   * @param {object} [deps]
   * @param {PocketTtsClient} [deps.client] - Injectable for tests.
   * @param {{info: Function, warn: Function, debug: Function}} [deps.logger] - Injectable for tests.
   * @param {() => number} [deps.now] - Clock, injectable for tests.
   * @param {boolean} [deps.timers] - Whether to check the servers periodically.
   */
  constructor(
    gladys,
    { client = new PocketTtsClient(), logger = defaultLogger, now = Date.now, timers = true } = {},
  ) {
    this.gladys = gladys;
    this.client = client;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.timer = null;
    this.settings = normalizeConfig({});
    this.loaded = false;
    this.loading = null;
    // Bumped by every configuration: a clip made with older settings is not kept.
    this.generation = 0;
    this.cache = new Map();
    this.inFlight = new Map();
    this.status = null;
    // Whether the servers answered at the last contact: true, false, or
    // undefined before the first one (or without an address).
    this.online = undefined;
  }

  /**
   * Take the settings into account, then check the servers.
   * @param {Record<string, unknown>} rawConfig - Configuration from the SDK.
   * @returns {Promise<void>} Never rejects.
   */
  async applyConfig(rawConfig) {
    this.useConfig(rawConfig);
    this.startTimer();
    await this.check();
  }

  /**
   * Take the settings into account, synchronously.
   * @param {Record<string, unknown>} rawConfig - Configuration from the SDK.
   * @returns {void}
   */
  useConfig(rawConfig) {
    this.settings = normalizeConfig(rawConfig);
    this.loaded = true;
    this.generation += 1;
    this.cache.clear();
    this.inFlight.clear();
    const servers = serversOf(this.settings)
      .map(({ baseUrl, languages }) => `${baseUrl} (${languages.join(', ') || 'unused'})`)
      .join(', ');
    this.logger.info(`Settings: ${servers || 'no server'}`);
  }

  /** Check the servers every CHECK_INTERVAL_MS, once. */
  startTimer() {
    if (!this.timers || this.timer) {
      return;
    }
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  /** Stop the periodic check (shutdown, tests). */
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Check every server with `/health`, shown as the status.
   * @returns {Promise<void>} Never rejects.
   */
  async check() {
    const { settings, generation } = this;
    const servers = serversOf(settings);
    if (settings.invalid.length > 0 || servers.length === 0) {
      this.online = undefined;
      await this.reportStatus(
        false,
        settings.invalid.length > 0 ? MESSAGES.invalid_url : MESSAGES.not_configured,
      );
      return;
    }
    for (const { baseUrl } of servers) {
      try {
        await this.client.health(baseUrl);
      } catch (err) {
        if (generation === this.generation) {
          await this.markOffline(err, baseUrl);
        }
        return;
      }
    }
    if (generation !== this.generation) {
      return;
    }
    this.logger.debug(`Servers checked: ${servers.length}`);
    await this.markOnline(readyMessage(servers.length));
  }

  /**
   * Read the configuration when a command arrives before the SDK
   * resynchronized it.
   * @returns {Promise<void>}
   */
  async load() {
    if (this.loaded) {
      return;
    }
    this.loading ??= this.gladys.getConfig().then(
      (config) => {
        this.useConfig(config);
        this.startTimer();
        // Not awaited: the request waiting has its own time budget.
        this.check();
      },
      (err) => {
        this.loading = null;
        throw err;
      },
    );
    await this.loading;
  }

  /**
   * Synthesize a text Gladys wants spoken.
   * @param {string} text - The text (≤ 2,000 characters, capped by Gladys).
   * @param {string|null} language - Language of the requesting user, null when unknown.
   * @returns {Promise<string>} The clip, as `audio/wav;base64,…`.
   * @throws {Error} When no clip can be made.
   */
  async handleSynthesize(text, language) {
    try {
      await this.load();
      const { audio, type } = await this.speak(
        typeof text === 'string' ? text : '',
        requestLanguage(language),
      );
      return `${type};base64,${audio.toString('base64')}`;
    } catch (err) {
      // The failed ack only reaches the Gladys server log, as a text (the core
      // does not localize a synthesis error): say it here too, in English.
      const text = err.message?.en ?? err.message;
      this.logger.warn(`Speech not synthesized: ${text}`);
      throw new Error(text, { cause: err });
    }
  }

  /**
   * The "Test the voice" button: speaks a sentence with the saved settings.
   * @param {{language?: string}} [fields] - The language to test (French by default).
   * @returns {Promise<{en: string, fr: string, de: string, es: string}>} The message.
   * @throws {ActionFailure} When no clip can be made.
   */
  async testVoice(fields = {}) {
    await this.load();
    const language = requestLanguage(fields?.language);
    const start = this.now();
    // Never from memory: the button must really reach the server.
    const clip = await this.speak(SAMPLES[language], language, { fresh: true });
    const test = { language, voice: clip.voice, seconds: clip.seconds, ms: this.now() - start };
    this.logger.info(
      `Voice tested: ${test.voice || 'server default'} (${language}), ${test.seconds.toFixed(1)} s of sound in ${test.ms} ms`,
    );
    return testMessage(test);
  }

  /**
   * The "Show the voices" button: the built-in voices, for one language. The
   * server has no voice list: the catalog is the one of Pocket TTS.
   * @param {{language?: string}} [fields] - The language, all when absent.
   * @returns {Promise<{en: string, fr: string, de: string, es: string}>} The message.
   */
  async listVoices(fields = {}) {
    const language = fields?.language ? requestLanguage(fields.language) : null;
    this.logger.info(`Voices listed${language ? ` (${language})` : ''}`);
    return voicesMessage(language);
  }

  /**
   * The clip of a text: from memory, from a synthesis already running, or
   * from the server. Reports the server's state as the status.
   * @param {string} text - The text.
   * @param {string} language - A code of LANGUAGES.
   * @param {{fresh?: boolean}} [options] - `fresh`: ask the server even when the clip is known.
   * @returns {Promise<{audio: Buffer, type: string, seconds: number, voice: string}>} The clip.
   * @throws {ActionFailure} The actionable failure.
   */
  async speak(text, language, { fresh = false } = {}) {
    const { settings, generation } = this;
    const input = text.trim();
    if (!/[\p{L}\p{N}]/u.test(input)) {
      throw failure(new LocalError('empty', 'nothing to say in the text'));
    }
    const route = routeFor(settings, language);
    if (!route.baseUrl) {
      const kind = settings.invalid.length > 0 ? 'invalid_url' : 'not_configured';
      throw failure(new LocalError(kind, 'no valid server address configured'));
    }
    const key = JSON.stringify([route.baseUrl, route.voice, input]);
    const cached = fresh ? null : this.cache.get(key);
    if (cached) {
      this.logger.debug(`Clip served from memory (${input.length} characters)`);
      return cached;
    }
    let pending = fresh ? null : this.inFlight.get(key);
    if (!pending) {
      pending = this.client.speak(route, input).then((clip) => ({ ...clip, voice: route.voice }));
      this.inFlight.set(key, pending);
      pending
        .finally(() => {
          if (this.inFlight.get(key) === pending) {
            this.inFlight.delete(key);
          }
        })
        .catch(() => {});
    }

    let clip;
    try {
      clip = await pending;
    } catch (err) {
      // A synthesis that runs out of time says nothing of the server: on a
      // processor, a long text just takes longer than Gladys waits. Nor does
      // a voice it cannot load. The periodic check tells about the server.
      if (generation === this.generation && SPEECH_OFFLINE_ERRORS.includes(err?.kind)) {
        await this.markOffline(err, route.baseUrl);
      }
      throw failure(err);
    }
    if (generation === this.generation && this.online === false) {
      // Back after an outage: the periodic check refines the message later.
      await this.markOnline(readyMessage(serversOf(settings).length));
    }
    if (generation === this.generation) {
      this.cache.set(key, clip);
      if (this.cache.size > CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value);
      }
    }
    this.logger.debug(
      `Clip synthesized with "${route.voice || 'server default'}": ${input.length} characters, ${clip.seconds.toFixed(1)} s, ${clip.audio.length} bytes${clip.resampled ? ` resampled to ${clip.sampleRate} Hz` : ''}`,
    );
    return clip;
  }

  /**
   * The servers answer: status, and the `server_online` trigger after an outage.
   * @param {{en: string, fr: string, de: string, es: string}} message - The status.
   * @returns {Promise<void>}
   */
  async markOnline(message) {
    const was = this.online;
    this.online = true;
    if (was === false) {
      this.logger.info('The Pocket TTS server answers again');
      await this.fire('server_online');
    } else if (was === undefined) {
      this.logger.info('The Pocket TTS server answers');
    }
    await this.reportStatus(true, message);
  }

  /**
   * A server fails: status, and the `server_offline` trigger once per outage.
   * @param {Error & {kind?: string}} err - The failure.
   * @param {string|null} baseUrl - The server that failed.
   * @returns {Promise<void>}
   */
  async markOffline(err, baseUrl) {
    const was = this.online;
    this.online = false;
    if (was !== false) {
      this.logger.warn(`The Pocket TTS server ${baseUrl} is unavailable: ${err?.message}`);
      await this.fire('server_offline');
    }
    const several = serversOf(this.settings).length > 1;
    await this.reportStatus(false, serverMessage(err, baseUrl, several));
  }

  /**
   * Fire a scene trigger; a failure is logged, never thrown.
   * @param {string} key - The trigger key of the manifest.
   * @returns {Promise<void>}
   */
  async fire(key) {
    try {
      await this.gladys.publishSceneEvent(key);
    } catch (err) {
      this.logger.warn(`Could not fire the ${key} scene trigger: ${err.message}`);
    }
  }

  /**
   * Publish the status, only when it changes. A failure is logged, never thrown.
   * @param {boolean} connected - Whether the servers answer.
   * @param {{en: string, fr: string, de: string, es: string}} message - Shown to the administrator.
   * @returns {Promise<void>}
   */
  async reportStatus(connected, message) {
    if (this.status?.connected === connected && this.status?.message.en === message.en) {
      return;
    }
    this.status = { connected, message };
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (statusErr) {
      this.logger.warn(`Unable to publish the status: ${statusErr.message}`);
    }
  }
}
