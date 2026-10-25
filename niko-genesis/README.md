# NIKO STUDIO — CINÉ GENESIS OPEN (Android / iOS)

Module intégré **sans écraser** `../index.html` (IA Studio Ciné original de Studio Niko Design). Projet dérivé conceptuellement du studio CINÉ-GENESIS partagé dans la conversation ; les inspirations GitHub sont attribuées ci-dessous.

## Utilisation

- **GitHub Pages** : ouvrir `niko-genesis/`. Le montage du scénario, la saisie, les exports JSON/TXT/CSV et les étapes de préparation fonctionnent localement. **GitHub Pages ne fournit pas de serveur Ollama/ComfyUI** : les boutons de génération IA ne fonctionnent pas en mode statique.
- **Sur un serveur IA local** : installer Python 3.10+, Ollama et ComfyUI puis lancer `python niko-genesis/server.py` depuis le dépôt.
- URL locale : http://127.0.0.1:8765/niko-genesis/
- Modèle Ollama par défaut : `qwen2.5:7b`, à installer (`ollama pull qwen2.5:7b`).
- Depuis ComfyUI, exporter un workflow **format API** vers `niko-genesis/workflows/image_api.json` (image) et `video_api.json` (image-to-video). Les modèles ne sont pas livrés avec ce dépôt. Les noms de nœuds, fichiers checkpoints et codecs doivent correspondre à l'installation.
- Remplacer dans ces workflows les valeurs des paramètres concernés par les marqueurs `__PROMPT__`, `__IMAGE__`, `__WIDTH__`, `__HEIGHT__`, `__SEED__` ; le serveur remplit les paramètres avant d'envoyer la tâche à ComfyUI. `__IMAGE__` est le nom de l'image téléversée, à placer dans LoadImage.

## Mobile

Depuis Chrome sur Android ou Safari sur iPhone, ouvrir l'adresse HTTPS de l'application, puis l'ajouter à l'écran d'accueil. Le smartphone pilote les modèles GPU hébergés sur ton serveur et ne fait pas tourner Wan/FLUX localement. Les pages statiques sont mises en cache pour une lecture hors ligne partielle ; les générations nécessitent la connexion.

Pour un accès réseau, utiliser un **VPN ou un reverse proxy HTTPS authentifié**. Ex. : `HOST=0.0.0.0 NIKO_STUDIO_TOKEN=une-longue-valeur-aleatoire python niko-genesis/server.py`. Ne jamais exposer un serveur IA ouvert sur l'Internet public ni mettre de clé dans le HTML.

## Fonctionnalités et limites

**Implémenté** : genre, idée et synopsis, casting, descriptions physiques, décors, scènes, plans, prompts I2V, génération via API locale configurée, sauvegarde locale dans IndexedDB, import/export projet JSON, liste CSV, prompts Wan/Flow, export individuel de rush vidéo, interface tactile responsive.

**Pas encore implémenté** : export MP4 final assemblé, synchronisation cloud chiffrée, verrouillage facial avec référence image de ComfyUI, application native App Store/Play Store et files de tâches durable côté serveur. Les médias vidéo sont conservés dans IndexedDB, et les fichiers vidéo ne sont **pas** inclus dans l'export JSON : télécharger les rushes séparément. Safari peut effacer du stockage : exporter régulièrement.

## Inspirations et crédits

- [CINÉ-GENESIS](https://github.com/laurentvoanhofficiel-jpg/Voanh-Agnes-film-maker)
- [Ai Movie Maker Tools](https://github.com/laurentvoanhofficiel-jpg/Ai-Movie-maker-tools)
- [Storyboard Google Flow](https://github.com/laurentvoanhofficiel-jpg/Agnes-ai-story-bord-maker-for-Google-flow-)
- [Personnages](https://github.com/laurentvoanhofficiel-jpg/Agnes-ai-film-maker-tools-for-character)
- [Prompts Google Flow](https://github.com/laurentvoanhofficiel-jpg/Agnes-ai-make-Google-flow-prompt-from-picture)

Les idées fonctionnelles ont été adaptées ; les codes originaux et leurs licences restent la propriété de leurs auteurs. Le projet préserve le Studio Niko Design existant, sans le remplacer.

## Validation

```bash
python -m py_compile niko-genesis/server.py
```

Le test de bout en bout (Ollama + checkpoints ComfyUI + export vidéo sur téléphone) nécessite le matériel et des workflows réels.
