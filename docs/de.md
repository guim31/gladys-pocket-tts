# Pocket TTS

Gibt Gladys eine natürliche Stimme mit **Pocket TTS**, dem Sprachausgabemodell
von [Kyutai](https://kyutai.org) (einem französischen Forschungslabor). Es
läuft auf einem einfachen **Prozessor, ohne Grafikkarte**, auf einem Rechner
in deinem Netzwerk: Die Texte bleiben bei dir. Die Durchsagen der Szenen werden
damit auf deinen Lautsprechern gesprochen.

## Was du bekommst

- Eine **Stimme für Gladys** (Gladys 5.3.0 oder neuer): Einmal ausgewählt,
  spricht die Szenenaktion **Auf einem Lautsprecher sprechen** mit Pocket TTS
  auf deinen Lautsprechern (Sonos, Google Cast, AirPlay…).
- **Französisch, Englisch, Deutsch und Spanisch**: Ein Pocket-TTS-Server lädt
  eine Sprache, und jede Sprache von Gladys kann ihren eigenen Server haben.
  Jeder Benutzer hört seine Sprache.
- **Eine Stimme pro Sprache**: eine der 27 eingebauten Stimmen (estelle auf
  Französisch, juergen auf Deutsch, lola auf Spanisch, alba und zwanzig
  weitere auf Englisch) oder deine eigene Stimme, aus einer WAV-Datei geklont.
- Die Schaltflächen **Stimme testen** und **Stimmen anzeigen** in der
  Konfiguration.
- Zwei Szenenauslöser: **Pocket-TTS-Server nicht verfügbar** und
  **Pocket-TTS-Server wieder da**, zum Beispiel um gewarnt zu werden, wenn
  Durchsagen nicht mehr gesprochen werden können.

## Bevor du anfängst

- Starte einen Pocket-TTS-Server auf einem Rechner in deinem Netzwerk (Linux,
  macOS oder Windows, etwa 500 MB Arbeitsspeicher pro Server) mit der
  gewünschten Sprache:
  - mit der eigenständigen Binärdatei der
    [Releases](https://github.com/kyutai-labs/pocket-tts/releases) (weder
    Python noch PyTorch nötig):
    `./pocket-tts serve --host 0.0.0.0 --language german`;
  - oder mit Python: `uvx pocket-tts serve --host 0.0.0.0 --language german`.
- Sprachen: `french`, `english`, `german`, `spanish` (und `italian`,
  `portuguese`, `dutch`, die Gladys nicht nutzt). Die Varianten `_24l`
  (`german_24l`…) sind größere, bessere und langsamere Vorabversionen.
- Ein Server pro Sprache: Um Deutsch und Englisch zu sprechen, starte zwei
  Server auf zwei Ports (`--port 8001`). Mit einem einzigen Server werden alle
  Sprachen von seinem Modell gesprochen.
- Die Modelle und Stimmen werden beim ersten Start von Hugging Face
  heruntergeladen und dann im Cache behalten.
- Stimmen: Lizenzen auf
  [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- Nicht mit Kyutai verbunden.

## Konfiguration

1. Installiere die Integration und öffne ihren Reiter **Konfiguration**.
2. **Serveradresse**: die Adresse deines Pocket-TTS-Servers, zum Beispiel
   `http://<Host>:8000`. Ein bloßes `Host:Port` wird mit `http://` ergänzt. Er
   spricht jede Sprache, die keinen eigenen Server hat.
3. **Server für Französisch / Englisch / Deutsch / Spanisch** (optional): die
   Adresse eines Servers, der mit dieser Sprache gestartet wurde. Leer: Der
   Hauptserver spricht sie.
4. **Stimmen**: eine pro Sprache. Eine eingebaute Stimme (`estelle`, `alba`,
   `juergen`, `lola`, `marius`, `cosette`…) oder eine `hf://`- oder
   `https://`-Adresse einer WAV-Datei zum Klonen. Leer: die Standardstimme des
   Servers (die seiner Sprache).
5. Speichere, drücke dann **Stimmen anzeigen**, um die eingebauten Stimmen zu
   sehen, und **Stimme testen**, um zu prüfen, ob ein Clip zurückkommt
   (Sekunden Ton und benötigte Zeit; die Schaltfläche spielt ihn nicht ab).
6. Öffne **Integrationen → Künstliche Intelligenz** und wähle Pocket TTS in der
   Karte **Stimme**.

## In Szenen verwenden

Füge einer Szene die Aktion **Auf einem Lautsprecher sprechen** hinzu, wähle
einen Lautsprecher und gib den Text ein. Gladys fragt diese Integration nach
dem Clip und liefert ihn dann im lokalen Netzwerk an den Lautsprecher.

Die Auslöser **Pocket-TTS-Server nicht verfügbar** (ein Server antwortet nicht
mehr) und **Pocket-TTS-Server wieder da** starten eine Szene, zum Beispiel um
dir eine Nachricht zu schicken. Die Server werden alle 5 Minuten und bei jeder
Durchsage geprüft.

Der Sprachassistent von Gladys bleibt mit einer Stimmintegration textbasiert:
Seine Seite läuft über HTTPS, und der Clip wird im lokalen Netzwerk über HTTP
geliefert, was der Browser blockiert. Das ist eine Grenze von Gladys, für jede
Stimmintegration gleich.

## Grenzen

- **Gladys wartet 30 Sekunden** auf den Clip. Gemessen auf einem Mini-PC mit
  4 Kernen: 2 s für einen Satz mit 50 Zeichen, 8 s für 300, 20 s für 600.
  Halte Durchsagen **unter etwa 600 Zeichen**. Ein Text, der zu lange dauert,
  schlägt fehl, ohne den Server als nicht verfügbar zu markieren.
- **Eine Stimme aus einer Datei zu klonen** (`hf://`, `https://`) braucht das
  Klonmodell: Akzeptiere seine Bedingungen auf
  [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
  und melde dich auf dem Serverrechner an (`uvx hf auth login`). Die
  eingebauten Stimmen funktionieren ohne.
- Die Clips sind WAV (24 kHz). Gladys lehnt Clips über 5 MB ab (etwa 100
  Sekunden): Ein längerer Clip wird auf eine niedrigere Rate umgerechnet.
- Ein bereits erstellter Clip (gleicher Text, Server und Stimme) bleibt im
  Speicher (die 16 letzten), und eine Durchsage auf mehreren Lautsprechern
  fragt den Server nur einmal.
- Keine Geschwindigkeitseinstellung: Pocket TTS hat keine.

## Fehlerbehebung

- Die **Überwachung** zeigt, ob die Server antworten, und nennt den, der nicht
  antwortet.
- Eine fehlgeschlagene Durchsage wird in die **Logs** der Integration
  geschrieben, mit dem Grund, den der Server nennt (Stimme, die er nicht laden
  kann, keine Antwort in der Zeit…). Der gesprochene Text wird nie
  geschrieben.
- „Nicht erreichbar“: Prüfe den Port (standardmäßig 8000) und ob der Server mit `--host 0.0.0.0` gestartet wurde (standardmäßig
  hört er nur auf seinem eigenen Rechner).
- Mehr Details im Debug: Stelle die Protokollstufe der Integration auf debug.
