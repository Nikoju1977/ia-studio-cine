# META-STUDIO PRO V5.3 — Studio Niko Design

Studio cinéma dans le navigateur : génération vidéo IA LTX Video gratuite sur Hugging Face ZeroGPU (Agnes facultatif), médiathèque, timeline, traitement d’image et audio, exports de projets. Interface française, HTML/CSS/JavaScript natifs.

**Page principale :** [index.html](./index.html) — **Version :** 5.3.

## Démarrage
1. Lancer un serveur statique dans ce dossier : python3 -m http.server 8000
2. Ouvrir http://localhost:8000
3. Dans **Production → Vidéo**, conserver **LTX Video · GPU partagé gratuit**, saisir un prompt et choisir la durée. Une image de la médiathèque peut servir de première image. Pour les autres modes IA, une clé Agnes reste nécessaire.
4. Ajouter les résultats à la timeline, créer des overlays, appliquer les looks et exporter.

Les modules JavaScript nécessitent HTTP/HTTPS. Sur GitHub Pages, la génération gratuite passe directement par l’API publique Gradio du Space Lightricks ; le navigateur et le Space doivent autoriser les appels CORS. En cas de refus, ouvrir le Space officiel directement. Les appels Agnes peuvent eux aussi être bloqués par CORS.

## Fonctionnalités

- **LTX Video (sélectionné par défaut)** : véritable modèle de génération texte→vidéo ou image→vidéo (LTX-Video 13B Distilled), calculé sur les GPU partagés Hugging Face ZeroGPU, sans clé API développeur ni carte bancaire. L’API Gradio accepte le prompt, téléverse éventuellement une image, suit la tâche par événements et ajoute **uniquement le vrai fichier vidéo** renvoyé à la médiathèque. Aucun résultat simulé ni moteur payant automatique.

- **Agnes :** chat et image via Agnes 2.5 ; vidéo via Video 2.5 Flash (720p) ou Video 2.5 (facturation possible avec accord explicite). Génération text-to-video et animation depuis une image importée avec mode keyframe, suivi par video_id, annulation locale et respect du Retry-After lors d’un code 429. Les créations vidéo POST ne sont jamais retentées automatiquement. Plusieurs clés peuvent être chargées en mémoire, sans garantie de quota supplémentaire.
- **Médiathèque :** imports locaux image et vidéo, previews, ajout à la timeline.
- **Montage :** trois pistes vidéo/audio/texte, déplacements, coupes conservant les in-points, suppression, scrub et prévisualisation à 24 i/s.
- **Color Lab :** six looks et lift, gamma, gain, saturation (Canvas, 8 bits).
- **Outils locaux :** masque de luminance, carte de luminance et redimensionnement x2, clairement distingués d’une véritable segmentation/profondeur/super-résolution par IA.
- **Audio :** ajout de sons, balance d’écoute des pistes, niveau dBFS RMS d’un fichier et synthèse vocale système.
- **Agent local :** commandes textuelles déterministes (pas un LLM autonome).
- **Export :** véritable film assemblé HD/Full HD avec titres et mixage des pistes audio grâce à Canvas, Web Audio et MediaRecorder (WebM/MP4 selon navigateur), plus médias sources, ZIP, projet JSON, EDL, OTIO JSON et FCPXML référentiel.

## Limitations honnêtes
- **LTX sur ZeroGPU n’est pas illimité** : l’accès gratuit dispose d’un quota de temps de GPU quotidien (documentation Hugging Face : 2 minutes en anonyme, 5 minutes avec compte gratuit), de files d’attente et de restrictions éventuelles. Les clips peuvent échouer et ne sont pas garantis. Les paramètres proposés par le modèle sont approximativement de 0,3 à 8,5 s. Le backend et les capacités du Space tiers peuvent changer.
- **Test réel non confirmé à ce jour :** le code est enregistré sur GitHub et vérifié statiquement, mais aucune génération IA de bout en bout n’a été confirmée depuis un navigateur Android avec réception d’un MP4. Un échec CORS ou un quota saturé reste possible.
- La génération Agnes nécessite une clé et une connexion réseau, et n’a pas été testée ici avec une clé réelle. Les quotas et tarifs restent ceux du fournisseur.
- Les URL blob: locales expirent après fermeture du navigateur ; les URL CDN distantes peuvent expirer. L’export ZIP dépend de la disponibilité et du CORS des médias.
- Le **rendu vidéo** s'effectue en temps réel dans le navigateur, jusqu'à 15 min par export. Le format est **WebM ou MP4 selon MediaRecorder** ; l'exactitude image par image et la lecture de tous les codecs ne sont pas garanties. Pas de ProRes/DNxHR, pas de rendu serveur. Les sources distantes sans autorisation CORS ne peuvent pas être capturées.
- **Pas d’ACES officiel** : looks RGB natifs uniquement.
- **Pas d’EBU R128 / LUFS conforme** : le compteur est un RMS dBFS.
- **Pas de SlimSAM, Depth Anything ou Swin2SR installés** : les outils locaux sont algorithmiques.
- Les exports de montage décrivent structure et liens médias, et peuvent nécessiter un relink dans le logiciel cible.

## Sécurité
Aucune clé API n’est enregistrée dans le dépôt, localStorage, sessionStorage, les journaux ou les exports. Les clés sont conservées seulement dans la mémoire de l’onglet. Elles sont néanmoins visibles par le navigateur et transmises directement au fournisseur ; pour une protection renforcée, un proxy serveur authentifié est nécessaire.

## Validation
La CI GitHub teste la syntaxe de meta-studio-v5-core.js, meta-studio-v5-media.js et meta-studio-v5-render.js avec node --check, puis les identifiants HTML, les dépendances et l’absence de stockage de clés grâce à node verify-v5.mjs. Cela ne remplace pas des tests de bout en bout avec Agnes ou un logiciel de montage.

## Modules historiques conservés
Le dépôt conserve niko-genesis/ (NIKO STUDIO — CINÉ GENESIS), motionlibre/, wangp_bridge.html et leur historique. La page principale de l’ancien AI STUDIO PRO a été remplacée ; les autres modules ne sont pas supprimés.

**Studio Niko Design — Nicolas Julienne.**

## Rendu film V5.1

1. Importez des plans dans la médiathèque ; ajoutez-les à V1. Importez la bande-son dans A1 et insérez les textes dans TEXTE.
2. Ouvrez **Exports & projets** puis **Film monté** et choisissez HD ou Full HD.
3. Lancez le rendu sans verrouiller l’écran, laissez l’onglet actif jusqu’au téléchargement. Annuler interrompt l'encodage et écarte le fichier partiel.
4. Sur appareils mobiles, privilégiez 720p et des vidéos MP4/WebM compatibles ; vérifiez toujours le fichier final. Les sources distantes Agnes doivent autoriser CORS ou être réimportées localement.

Ce rendu utilise les capacités MediaRecorder/Canvas/Web Audio du navigateur. Il ne certifie ni la cadence constante, ni l'étalonnage broadcast, ni la fidélité des effets. Les looks Color Lab appliqués à des images séparées doivent être ajoutés à la médiathèque avant export.

## Correctif V5.2 : erreur Agnes HTTP 500 et mobile

- La capture Android du 12 novembre 2026 montrait un HTTP 500 : « Model agnes-video-v2.0 is temporarily unavailable ».
- Passage du protocole vidéo V2.0 hérité à Video 2.5 : `model`, `mode`, `seconds` (4 à 12 s), `size: "720P"`, `aspect_ratio`, `n: 1` et `model_name` au suivi GET.
- Modèle Video 2.5 Flash par défaut. L'option Video 2.5 exige une confirmation explicite pour la facturation potentielle. Aucun basculement automatique vers un modèle payant.
- Une image de médiathèque peut être choisie volontairement comme première image. L'image locale est envoyée via Data URI Base64 après sélection, dans la limite de 4,5 Mo. Une URL HTTPS reste transmise comme référence : sa disponibilité côté Agnes n'est pas garantie.
- En HTTP 500/503, message français explicite, identifiant de support conservé lorsqu'il existe, image et prompt préservés, et aucune simulation de succès.
- Pour éviter les doubles tâches et une facturation imprévue, les appels de création POST ne sont pas relancés automatiquement. Les consultations GET peuvent être reprises après une pause bornée.
- Navigation mobile en grille 2 colonnes pour que les sept modules soient toujours visibles sans barre horizontale décalée.
- **Vérification restant à faire :** création et encodage réels avec une clé Agnes valide, ainsi qu'un test navigateur Android complet ; le statut de déploiement ne prouve pas leur réussite.

Référence de protocole : https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/references/model_catalog.md

## V5.3 — Génération IA réellement gratuite (ZeroGPU)

- Moteur par défaut : [Space Lightricks LTX Video Fast](https://huggingface.co/spaces/Lightricks/ltx-video-distilled) (code du Space : [app.py](https://huggingface.co/spaces/Lightricks/ltx-video-distilled/blob/main/app.py)).
- Appels POST /gradio_api/call/text_to_video ou /image_to_video, lecture du résultat via les événements de la file Gradio. Téléversement /gradio_api/upload pour les images de référence.
- Les quotas, l’accessibilité du Space, le CORS et la génération finale dépendent de Hugging Face. Toute erreur est présentée à l’utilisateur ; aucun faux MP4 n’est ajouté.
- L’option Agnes est conservée, mais ne se déclenche jamais automatiquement après un échec de LTX, notamment pour éviter toute facturation.
- **Protocole et quotas** : https://huggingface.co/docs/hub/spaces-api-endpoints
