# Pocket TTS

Gives Gladys a natural voice with **Pocket TTS**, the text-to-speech model of
[Kyutai](https://kyutai.org) (a French research lab). It runs on a simple
**processor, without graphics card**, on a machine of your network: the texts
stay at home. The scene announcements are spoken by it on your speakers.

## What you get

- A **voice for Gladys** (Gladys 5.3.0 or later): once selected, the **Talk on a
  speaker** scene action speaks with Pocket TTS on your speakers (Sonos,
  Google Cast, AirPlay…).
- **French, English, German and Spanish**: a Pocket TTS server loads one
  language, and each language of Gladys can have its own server. Each user
  hears their language.
- **One voice per language**: one of the 27 built-in voices (estelle in
  French, juergen in German, lola in Spanish, alba and twenty more in
  English), or your own voice cloned from a WAV file.
- **Test the voice** and **Show the voices** buttons in the configuration.
- Two scene triggers: **Pocket TTS server unavailable** and **Pocket TTS
  server back**, for example to be warned when announcements can no longer be
  spoken.

## Before you start

- Run a Pocket TTS server on a machine of your network (Linux, macOS or
  Windows, about 500 MB of memory per server), with the language you want:
  - with the standalone binary of the
    [releases](https://github.com/kyutai-labs/pocket-tts/releases) (neither
    Python nor PyTorch needed):
    `./pocket-tts serve --host 0.0.0.0 --language french`;
  - or with Python: `uvx pocket-tts serve --host 0.0.0.0 --language french`.
- Languages: `french`, `english`, `german`, `spanish` (and `italian`,
  `portuguese`, `dutch`, which Gladys does not use). The `_24l` variants
  (`french_24l`…) are bigger, better and slower previews.
- One server per language: to speak French and English, start two servers on
  two ports (`--port 8001`). With a single server, every language is spoken by
  its model.
- The models and voices are downloaded from Hugging Face at the first start,
  then kept in cache.
- Voices: licenses on [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- Not affiliated with Kyutai.

## Configuration

1. Install the integration, then open its **Configuration** tab.
2. **Server address**: the address of your Pocket TTS server, for example
   `http://<host>:8000`. A bare `host:port` is completed with `http://`. It
   speaks every language that has no server of its own.
3. **Server for French / English / German / Spanish** (optional): the address
   of a server started with that language. Empty: the main server speaks it.
4. **Voices**: one per language. A built-in voice (`estelle`, `alba`,
   `juergen`, `lola`, `marius`, `cosette`…), or an `hf://` or `https://`
   address of a WAV file to clone. Empty: the default voice of the server
   (that of its language).
5. Save, then press **Show the voices** to see the built-in voices, and **Test
   the voice** to check that a clip comes back (seconds of sound and time
   taken; the button does not play it).
6. Open **Integrations → Artificial Intelligence** and choose Pocket TTS in the
   **Voice** card.

## Using it in scenes

Add a **Talk on a speaker** action to a scene, pick a speaker and type the
text. Gladys asks this integration for the clip, then serves it to the speaker
on your local network.

The triggers **Pocket TTS server unavailable** (a server stopped answering)
and **Pocket TTS server back** start a scene, for example to send you a
message. The servers are checked every 5 minutes and at each announcement.

The voice assistant of Gladys stays text-only with a voice integration: its
page runs over HTTPS, and the clip is served over the local network in HTTP,
which the browser blocks. This is a limit of Gladys, the same for every voice
integration.

## Limits

- **Gladys waits 30 seconds** for the clip. Measured on a 4-core mini PC: 2 s
  for a sentence of 50 characters, 8 s for 300, 20 s for 600. Keep
  announcements **under about 600 characters**. A text that runs out of time
  fails without marking the server unavailable.
- **Cloning a voice** from a file (`hf://`, `https://`) needs the voice
  cloning model: accept its terms on
  [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
  and log in on the server machine (`uvx hf auth login`). The built-in voices
  work without it.
- The clips are WAV (24 kHz). Gladys refuses clips over 5 MB (about 100
  seconds): a longer clip is resampled to a lower rate.
- A clip already made (same text, server and voice) is kept in memory (the 16
  latest), and one announcement on several speakers asks the server once.
- No speed setting: Pocket TTS has none.

## Troubleshooting

- **Supervision** shows whether the servers answer, and names the one that
  does not.
- A failed announcement is written in the **logs** of the integration, with
  the reason the server gave (voice it cannot load, no answer in time…). The
  text spoken is never written.
- "Cannot be reached": check the port (8000 by default) and
  that the server was started with `--host 0.0.0.0` (by default it only
  listens to its own machine).
- More details in debug: set the log level of the integration to debug.
