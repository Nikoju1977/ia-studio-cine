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

**Implémenté en V2 (sur serveur Python avec FFmpeg et ffprobe)** : import de clips MP4/WebM/MOV depuis le téléphone, téléversement séquentiel avec reprise des éléments déjà envoyés, encodage uniforme H.264 720p/24 fps et AAC, montage chronologique jusqu'à 40 plans, sous-titres français intégrés au MP4 (piste `mov_text`) et export SRT indépendant. Le serveur conserve les médias et le statut des rendus dans `niko-genesis/.niko-media/`, même après fermeture du navigateur. En cas de redémarrage pendant un rendu, il faut cliquer sur **Assembler le film MP4** pour relancer le traitement. Le MP4 n'est généré que **sur le serveur FFmpeg** (pas via GitHub Pages).

**Limites actuelles** : pas de piste musicale ajoutée automatiquement, pas de mixage audio avancé ni de transitions, pas de synchronisation cloud chiffrée, pas de reconnaissance/verrouillage des visages, pas d'application native sur App Store/Play Store. Le rendu conserve l'audio des rushes existants, ou ajoute une piste silencieuse lorsque le rush est muet. Les médias vidéo ne sont **pas** inclus dans l'export JSON. Sur iOS, télécharger des MP4 volumineux peut consommer beaucoup de mémoire vive. Prévoir du disque libre sur le serveur et effacer manuellement les anciens rendus de `.niko-media/` après récupération ; aucun nettoyage automatique n'est encore en place. Safari peut supprimer les médias du navigateur : exporter les projets et récupérer les rushes régulièrement.

### Montage MP4, depuis un smartphone

1. Installer **FFmpeg** et **ffprobe** sur le serveur ; contrôler avec `ffmpeg -version` et `ffprobe -version`.
2. Ouvrir NIKO STUDIO à travers un tunnel/VPN ou un proxy HTTPS avec authentification, ou à l'adresse locale sur le serveur.
3. Dans **Plans**, créer le découpage, puis dans **Vidéos**, produire ou importer un rush par plan depuis l'appareil.
4. Cliquer sur **Assembler le film MP4**. Les rushes sont copiés dans le répertoire de travail du serveur et validés par `ffprobe`.
5. Cliquer sur **Vérifier le rendu** (le statut se rafraîchit également pendant le rendu). Une fois terminé, utiliser **Télécharger MP4** ou **Sous-titres SRT**.

Le format final est H.264/AAC, ratio sélectionné (16:9, 9:16, 1:1), images normalisées avec bandes si nécessaire. Les sous-titres sont intégrés sous forme de piste sélectionnable — ils ne sont **pas incrustés dans l'image**. L'affichage des pistes sélectionnables varie selon le lecteur mobile.

### Tester le rendu

```bash
python -m py_compile niko-genesis/server.py niko-genesis/render.py
python -m unittest discover -s niko-genesis/tests -v
```

Les tests de montage créent de petites vidéos synthétiques et contrôlent la présence des pistes H.264, AAC et `mov_text` dans le MP4. Les tests de génération IA réelle nécessitent toujours les modèles installés.


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

La validation du rendu FFmpeg est automatisée. Le test de bout en bout (Ollama + checkpoints ComfyUI + téléchargement sur téléphone) nécessite toujours le matériel, les workflows et un appareil réel.
