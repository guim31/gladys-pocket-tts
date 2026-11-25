# Gladys Pocket TTS

A text-to-speech provider for [Gladys Assistant](https://gladysassistant.com)
(5.3.0 or later) that speaks with
[**Pocket TTS**](https://github.com/kyutai-labs/pocket-tts), the CPU
text-to-speech model of [Kyutai](https://kyutai.org), run on your own network.
No graphics card, no cloud: once selected as the voice of Gladys, the scene
announcements are spoken by your Pocket TTS server on your speakers.

## Features

- French, English, German and Spanish: a Pocket TTS server loads one language
  model, and each language of Gladys can have its own server (the main server
  speaks the others).
- One voice per language: one of the 27 built-in voices (estelle, alba,
  juergen, lola, marius…), a voice cloned from a WAV file (`hf://`,
  `https://`), or the default voice of the server.
- **Test the voice** and **Show the voices** buttons.
- Status in Supervision, checked every 5 minutes with `/health` (never a
  synthesis), and scene triggers **Pocket TTS server unavailable** / **Pocket
  TTS server back**.
- The WAV header Pocket TTS streams (it claims 2 GB of data) is rewritten with
  the real sizes; a clip over the 5 MB Gladys accepts is resampled.
- One announcement on several speakers asks the server once; the 16 latest
  clips are kept in memory. The texts are never written to the logs.

## Requirements

- Gladys Assistant 5.3.0 or later.
- A Pocket TTS server reachable from Gladys, for example with the standalone
  binary of the [releases](https://github.com/kyutai-labs/pocket-tts/releases):
  `./pocket-tts serve --host 0.0.0.0 --language french` (about 500 MB of
  memory), or `uvx pocket-tts serve --host 0.0.0.0 --language french`.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-pocket-tts`. Then fill the server address
(`http://<host>:8000`) and, if you like, a server and a voice per language,
save, and choose Pocket TTS in **Integrations → Artificial Intelligence →
Voice**. The full guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## Limits

- Gladys waits 30 seconds for a clip. Measured on a 4-core mini PC: 2 s for 50
  characters, 8 s for 300, 20 s for 600: keep announcements under about 600
  characters.
- Cloning a voice from a file needs the voice cloning model of Pocket TTS,
  behind a Hugging Face login on the server; the built-in voices work without.
- No speed setting (Pocket TTS has none), WAV clips only.
- Tested for real against `pocket-tts serve` 3.3.0 (the standalone binary,
  French and English models); not tested on a real Gladys instance with real
  speakers. Feedback welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests never touch the network: `test/fixtures/pocket-tts/` holds real
answers of `pocket-tts serve` 3.3.0 (streamed WAV clips in French and English,
errors). See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Pocket TTS](https://github.com/kyutai-labs/pocket-tts) by Kyutai (MIT
  license for the code), used for the real tests and the fixtures. The voices
  have their own licenses, listed on
  [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- Cover: the Kyutai logo, from [kyutai.org](https://kyutai.org).
- Built on the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js) of Gladys,
  and on the shape of
  [gladys-openai-tts](https://github.com/guim31/gladys-openai-tts).

Not affiliated with Kyutai. Kyutai and Pocket TTS are names of Kyutai.
