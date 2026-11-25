# Pocket TTS

Da a Gladys una voz natural con **Pocket TTS**, el modelo de síntesis de voz de
[Kyutai](https://kyutai.org) (un laboratorio de investigación francés).
Funciona con un simple **procesador, sin tarjeta gráfica**, en una máquina de
su red: los textos se quedan en su casa. Los anuncios de las escenas se dicen
con él en sus altavoces.

## Lo que obtiene

- Una **voz para Gladys** (Gladys 5.3.0 o posterior): una vez elegida, la
  acción de escena **Hablar en un altavoz** habla con Pocket TTS en sus
  altavoces (Sonos, Google Cast, AirPlay…).
- **Francés, inglés, alemán y español**: un servidor Pocket TTS carga un
  idioma, y cada idioma de Gladys puede tener su propio servidor. Cada usuario
  oye su idioma.
- **Una voz por idioma**: una de las 27 voces integradas (estelle en francés,
  juergen en alemán, lola en español, alba y otras veinte en inglés), o su
  propia voz clonada desde un archivo WAV.
- Los botones **Probar la voz** y **Mostrar las voces** en la configuración.
- Dos disparadores de escena: **Servidor Pocket TTS no disponible** y
  **Servidor Pocket TTS de vuelta**, por ejemplo para recibir un aviso cuando
  los anuncios ya no se puedan decir.

## Antes de empezar

- Inicie un servidor Pocket TTS en una máquina de su red (Linux, macOS o
  Windows, unos 500 MB de memoria por servidor), con el idioma deseado:
  - con el binario autónomo de las
    [releases](https://github.com/kyutai-labs/pocket-tts/releases) (sin Python
    ni PyTorch): `./pocket-tts serve --host 0.0.0.0 --language spanish`;
  - o con Python: `uvx pocket-tts serve --host 0.0.0.0 --language spanish`.
- Idiomas: `french`, `english`, `german`, `spanish` (y `italian`,
  `portuguese`, `dutch`, que Gladys no usa). Las variantes `_24l`
  (`spanish_24l`…) son versiones preliminares más grandes, mejores y más
  lentas.
- Un servidor por idioma: para hablar español e inglés, inicie dos servidores
  en dos puertos (`--port 8001`). Con un solo servidor, todos los idiomas los
  dice su modelo.
- Los modelos y las voces se descargan de Hugging Face en el primer arranque y
  luego se guardan en caché.
- Voces: licencias en
  [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- Sin relación con Kyutai.

## Configuración

1. Instale la integración y abra su pestaña **Configuración**.
2. **Dirección del servidor**: la dirección de su servidor Pocket TTS, por
   ejemplo `http://<host>:8000`. Un simple `host:puerto` se completa con
   `http://`. Habla todos los idiomas que no tienen su propio servidor.
3. **Servidor para el francés / el inglés / el alemán / el español**
   (opcional): la dirección de un servidor iniciado con ese idioma. Vacío: lo
   habla el servidor principal.
4. **Voces**: una por idioma. Una voz integrada (`estelle`, `alba`,
   `juergen`, `lola`, `marius`, `cosette`…), o una dirección `hf://` o
   `https://` de un archivo WAV para clonar. Vacío: la voz predeterminada del
   servidor (la de su idioma).
5. Guarde y pulse **Mostrar las voces** para ver las voces integradas, y
   **Probar la voz** para comprobar que vuelve un clip (segundos de sonido y
   tiempo empleado; el botón no lo reproduce).
6. Abra **Integraciones → Inteligencia artificial** y elija Pocket TTS en la
   tarjeta **Voz**.

## Uso en las escenas

Añada una acción **Hablar en un altavoz** a una escena, elija un altavoz y
escriba el texto. Gladys pide el clip a esta integración y luego lo sirve al
altavoz en su red local.

Los disparadores **Servidor Pocket TTS no disponible** (un servidor ya no
responde) y **Servidor Pocket TTS de vuelta** inician una escena, por ejemplo
para enviarle un mensaje. Los servidores se comprueban cada 5 minutos.

El asistente de voz de Gladys sigue siendo de texto con una integración de
voz: su página funciona en HTTPS, y el clip se sirve en la red local en HTTP,
lo que el navegador bloquea. Es un límite de Gladys, el mismo para todas las
integraciones de voz.

## Límites

- **Gladys espera 30 segundos** el clip. Medido en un mini PC de 4 núcleos:
  2 s para una frase de 50 caracteres, 8 s para 300, 20 s para 600. Mantenga
  los anuncios **por debajo de unos 600 caracteres**. Un texto que supera el
  plazo falla sin marcar el servidor como no disponible.
- **Clonar una voz** desde un archivo (`hf://`, `https://`) requiere el modelo
  de clonación: acepte sus condiciones en
  [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
  e inicie sesión en la máquina del servidor (`uvx hf auth login`). Las voces
  integradas funcionan sin él.
- Los clips son WAV (24 kHz). Gladys rechaza los clips de más de 5 MB (unos
  100 segundos): un clip más largo se remuestrea a una frecuencia menor.
- Un clip ya hecho (mismo texto, servidor y voz) se guarda en memoria (los 16
  últimos), y un anuncio en varios altavoces solo pide una vez al servidor.
- Sin ajuste de velocidad: Pocket TTS no tiene.

## Solución de problemas

- La **Supervisión** indica si los servidores responden, y nombra el que no
  responde.
- Un anuncio fallido se escribe en los **registros** de la integración, con la
  razón que dio el servidor (voz que no puede cargar, sin respuesta a
  tiempo…). El texto dicho nunca se escribe.
- «No se puede acceder»: compruebe el puerto
  (8000 por defecto) y que el servidor se haya iniciado con `--host 0.0.0.0`
  (por defecto solo escucha en su propia máquina).
- Más detalles en debug: ponga el nivel de registro de la integración en
  debug.
