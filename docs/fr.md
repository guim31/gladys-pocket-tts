# Pocket TTS

Donne à Gladys une voix naturelle avec **Pocket TTS**, le modèle de synthèse
vocale de [Kyutai](https://kyutai.org) (laboratoire de recherche français). Il
tourne sur un simple **processeur, sans carte graphique**, sur une machine de
votre réseau : les textes restent chez vous. Les annonces des scènes sont dites
par lui sur vos enceintes.

## Ce que vous obtenez

- Une **voix pour Gladys** (Gladys 5.3.0 ou plus) : une fois choisie, l'action
  de scène **Parler sur une enceinte** parle avec Pocket TTS sur vos enceintes
  (Sonos, Google Cast, AirPlay…).
- **Français, anglais, allemand et espagnol** : un serveur Pocket TTS charge
  une langue, et chaque langue de Gladys peut avoir son propre serveur. Chaque
  utilisateur entend sa langue.
- **Une voix par langue** : l'une des 27 voix intégrées (estelle en français,
  juergen en allemand, lola en espagnol, alba et vingt autres en anglais), ou
  votre propre voix clonée depuis un fichier WAV.
- Des boutons **Tester la voix** et **Afficher les voix** dans la
  configuration.
- Deux déclencheurs de scène : **Serveur Pocket TTS indisponible** et
  **Serveur Pocket TTS revenu**, par exemple pour être prévenu quand les
  annonces ne peuvent plus être dites.

## Avant de commencer

- Lancez un serveur Pocket TTS sur une machine de votre réseau (Linux, macOS
  ou Windows, environ 500 Mo de mémoire par serveur), avec la langue voulue :
  - avec le binaire autonome des
    [releases](https://github.com/kyutai-labs/pocket-tts/releases) (ni Python
    ni PyTorch nécessaires) :
    `./pocket-tts serve --host 0.0.0.0 --language french` ;
  - ou avec Python : `uvx pocket-tts serve --host 0.0.0.0 --language french`.
- Langues : `french`, `english`, `german`, `spanish` (et `italian`,
  `portuguese`, `dutch`, que Gladys n'utilise pas). Les variantes `_24l`
  (`french_24l`…) sont des préversions plus grosses, meilleures et plus
  lentes.
- Un serveur par langue : pour parler français et anglais, lancez deux
  serveurs sur deux ports (`--port 8001`). Avec un seul serveur, toutes les
  langues sont dites par son modèle.
- Les modèles et les voix sont téléchargés depuis Hugging Face au premier
  démarrage, puis gardés en cache.
- Voix : licences sur
  [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices).
- Sans lien avec Kyutai.

## Configuration

1. Installez l'intégration, puis ouvrez son onglet **Configuration**.
2. **Adresse du serveur** : l'adresse de votre serveur Pocket TTS, par exemple
   `http://<hôte>:8000`. Un simple `hôte:port` est complété par `http://`. Il
   parle toutes les langues qui n'ont pas leur propre serveur.
3. **Serveur pour le français / l'anglais / l'allemand / l'espagnol**
   (facultatif) : l'adresse d'un serveur lancé avec cette langue. Vide : le
   serveur principal la parle.
4. **Voix** : une par langue. Une voix intégrée (`estelle`, `alba`,
   `juergen`, `lola`, `marius`, `cosette`…), ou une adresse `hf://` ou
   `https://` d'un fichier WAV à cloner. Vide : la voix par défaut du serveur
   (celle de sa langue).
5. Enregistrez, puis appuyez sur **Afficher les voix** pour voir les voix
   intégrées, et sur **Tester la voix** pour vérifier qu'un clip revient
   (secondes de son et temps mis ; le bouton ne le joue pas).
6. Ouvrez **Intégrations → Intelligence artificielle** et choisissez Pocket
   TTS dans la carte **Voix**.

## Utilisation dans les scènes

Ajoutez une action **Parler sur une enceinte** à une scène, choisissez une
enceinte et tapez le texte. Gladys demande le clip à cette intégration, puis le
sert à l'enceinte sur votre réseau local.

Les déclencheurs **Serveur Pocket TTS indisponible** (un serveur ne répond
plus) et **Serveur Pocket TTS revenu** lancent une scène, par exemple pour vous
envoyer un message. Les serveurs sont vérifiés toutes les 5 minutes et à
chaque annonce.

L'assistant vocal de Gladys reste en texte avec une intégration de voix : sa
page passe en HTTPS, et le clip est servi sur le réseau local en HTTP, ce que
le navigateur bloque. C'est une limite de Gladys, la même pour toutes les
intégrations de voix.

## Limites

- **Gladys attend 30 secondes** le clip. Mesuré sur un mini PC à 4 cœurs : 2 s
  pour une phrase de 50 caractères, 8 s pour 300, 20 s pour 600. Gardez des
  annonces de **moins de 600 caractères environ**. Un texte qui dépasse le
  délai échoue sans marquer le serveur indisponible.
- **Cloner une voix** depuis un fichier (`hf://`, `https://`) demande le
  modèle de clonage : acceptez ses conditions sur
  [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
  et connectez-vous sur la machine du serveur (`uvx hf auth login`). Les voix
  intégrées marchent sans.
- Les clips sont en WAV (24 kHz). Gladys refuse les clips de plus de 5 Mo
  (environ 100 secondes) : un clip plus long est rééchantillonné plus bas.
- Un clip déjà fait (même texte, serveur et voix) est gardé en mémoire (les 16
  derniers), et une annonce sur plusieurs enceintes ne sollicite le serveur
  qu'une fois.
- Pas de réglage de vitesse : Pocket TTS n'en a pas.

## Dépannage

- La **Supervision** indique si les serveurs répondent, et nomme celui qui ne
  répond pas.
- Une annonce ratée est écrite dans les **journaux** de l'intégration, avec la
  raison donnée par le serveur (voix qu'il ne peut pas charger, pas de réponse
  à temps…). Le texte dit n'est jamais écrit.
- « Injoignable » : vérifiez le port (8000 par
  défaut) et que le serveur a été lancé avec `--host 0.0.0.0` (par défaut, il
  n'écoute que sa propre machine).
- Plus de détails en debug : passez le niveau de journal de l'intégration en
  debug.
