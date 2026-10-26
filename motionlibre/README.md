# MotionLibre 1.3 — studio vidéo simplifié

MotionLibre transforme des **photos existantes** en petits montages animés avec mouvements de caméra, styles, transitions et musique. La vidéo est montée et exportée directement dans le navigateur.

## Utilisation en 3 étapes

1. **Photos** — ajoute des images depuis le téléphone ou l'ordinateur ; sélectionne celle que tu veux modifier.
2. **Prompt** — décris la scène, choisis une ambiance et un mouvement de caméra, puis clique sur **Créer mon prompt**. Si une photo est sélectionnée, le prompt lui est automatiquement appliqué.
3. **Vidéo** — regarde l'aperçu, choisis un format et clique sur **Exporter ma vidéo**.

Les retouches avancées (styles, légendes, intensité) et la qualité/durée de l'export sont accessibles en un clic, sans encombrer l'interface principale.

## Choisir le moteur de prompt

| Mode | Où tourne-t-il ? | À savoir |
| --- | --- | --- |
| **Express (défaut)** | Navigateur, règles locales | Immédiat, sans IA ni téléchargement |
| **SmolLM2 open source** | Navigateur sur l'appareil, via Transformers.js / WASM | Téléchargement initial du modèle ; mémoire et compatibilité du navigateur nécessaires |
| **Ollama** | Ordinateur/serveur local configuré | Nécessite Ollama et un modèle téléchargé (`ollama pull qwen2.5:1.5b` ou `ollama pull mistral`). Depuis un téléphone, `localhost` désigne le téléphone, pas le PC. CORS et HTTPS peuvent bloquer la connexion |
| **Mistral AI** | Service API externe optionnel | Nécessite une clé API et un accès Internet, éventuellement facturé ; la description textuelle est transmise au fournisseur |

Le modèle SmolLM2 utilisé est `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA`. Après son premier chargement, l'inférence de texte est locale si le navigateur le prend en charge ; la disponibilité hors ligne dépend du cache. Le navigateur charge la bibliothèque Transformers.js et les poids depuis des sources externes au premier lancement.

## Ce que fait réellement MotionLibre

- La génération de **prompt** sert à guider les mouvements et effets reconnus par l'application (travelling, zoom, teinte, pluie, neige, étoiles, vignette, etc.).
- Elle ne crée **pas** de nouvelles personnes, des décors photoréalistes ou des mouvements de personnage à partir du texte.
- Les photos, pistes audio et rendus vidéo ne sont pas envoyés à un serveur par l'application. En mode Mistral AI, le texte et la clé API transitent vers Mistral. La clé n'est pas enregistrée en `localStorage` ni intégrée à GitHub.
- La sortie vidéo est déterminée par les codecs pris en charge par le navigateur (notamment MP4 ou WebM) ; performances et export peuvent varier selon l'appareil.

## Lancer

Ouvre [l'application HTML](./index.html). Pour utiliser l'IA navigateur depuis une origine web standard, sers de préférence ce répertoire via un serveur statique HTTPS. GitHub Pages n'est pas activé automatiquement par ce commit.

Code source autonome : `motionlibre/index.html`. Aucun secret ne doit être ajouté au dépôt.

## Vérifications
Syntaxe des scripts JavaScript et intégrité des identifiants d'interface contrôlées ; la génération par SmolLM2, la connexion Ollama, l'API Mistral et l'export sur chaque modèle de téléphone restent à tester sur l'appareil cible.
