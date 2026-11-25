# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-25

### Added

- Pocket TTS (Kyutai) as the voice of Gladys (5.3.0 or later): the scene
  announcements are spoken by a `pocket-tts serve` server of your network, on a
  simple processor.
- A server per language (French, English, German, Spanish), the main server
  speaking the others, and a voice per language: built-in voice, voice cloned
  from a WAV file, or the server's default.
- **Test the voice** and **Show the voices** buttons.
- Status in Supervision and scene triggers **Pocket TTS server unavailable** /
  **Pocket TTS server back**, the servers being checked every 5 minutes.
- WAV clips with exact sizes, resampled when over the 5 MB Gladys accepts; one
  announcement on several speakers asks the server once.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-pocket-tts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-pocket-tts/releases/tag/v1.0.0
