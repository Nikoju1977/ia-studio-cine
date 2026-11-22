# META-STUDIO PRO V6 — Studio Niko Design

Studio cinéma dans le navigateur : réalisation autonome, vraie génération vidéo IA LTX-2.3 (22B) et LTX 13B sur Hugging Face ZeroGPU, storyboarding, médiathèque, timeline, traitement d’image et audio, exports de projets. Interface française, HTML/CSS/JavaScript natifs.

**Page principale :** [index.html](./index.html) — **Version :** 6.0.

## Démarrage
1. Lancer un serveur statique dans ce dossier : python3 -m http.server 8000
2. Ouvrir http://localhost:8000
3. Dans **Réalisateur autonome V6**, saisir un synopsis, choisir le style et cliquer sur « PRODUIRE LE FILM DE A À Z ». Le mode par défaut utilise LTX-2.3, sans clé ni abonnement. Pour le mode classique, sélectionnez Production → Vidéo ; pour l'image/chat, une clé Agnes reste nécessaire.
4. Ajouter les résultats à la timeline, créer des overlays, appliquer les looks et exporter.

Les modules JavaScript nécessitent HTTP/HTTPS. Sur GitHub Pages, la génération gratuite passe directement par les API publiques Gradio des Spaces Lightricks ; le navigateur et le Space doivent autoriser les appels CORS. En cas de refus, ouvrir le Space officiel directement. Les appels Agnes peuvent eux aussi être bloqués par CORS.

## Fonctionnalités

- **LTX 13B (moteur de secours)** : véritable modèle de génération texte→vidéo ou image→vidéo (LTX-Video 13B Distilled), calculé sur les GPU partagés Hugging Face ZeroGPU, sans clé API développeur ni carte bancaire. L’API Gradio accepte le prompt, téléverse éventuellement une image, suit la tâche par événements et ajoute **uniquement le vrai fichier vidéo** renvoyé à la médiathèque. Aucun résultat simulé ni moteur payant automatique.

- **Agnes :** chat et image via Agnes 2.5 ; vidéo via Video 2.5 Flash (720p) ou Video 2.5 (facturation possible avec accord explicite). Génération text-to-video et animation depuis une image importée avec mode keyframe, suivi par video_id, annulation locale et respect du Retry-After lors d’un code 429. Les créations vidéo POST ne sont jamais retentées automatiquement. Plusieurs clés peuvent être chargées en mémoire, sans garantie de quota supplémentaire.
- **Médiathèque :** imports locaux image et vidéo, previews, ajout à la timeline.
- **Montage :** trois pistes vidéo/audio/texte, déplacements, coupes conservant les in-points, suppression, scrub et prévisualisation à 24 i/s.
- **Color Lab :** six looks et lift, gamma, gain, saturation (Canvas, 8 bits).
- **Outils locaux :** masque de luminance, carte de luminance et redimensionnement x2, clairement distingués d’une véritable segmentation/profondeur/super-résolution par IA.
- **Audio :** ajout de sons, balance d’écoute des pistes, niveau dBFS RMS d’un fichier et synthèse vocale système.
- **Agent local :** commandes textuelles déterministes (pas un LLM autonome).
- **Export :** véritable film assemblé HD/Full HD avec titres et mixage des pistes audio grâce à Canvas, Web Audio et MediaRecorder (WebM/MP4 selon navigateur), plus médias sources, ZIP, projet JSON, EDL, OTIO JSON et FCPXML référentiel.

## Limitations honnêtes
- **ZeroGPU n’est pas illimité** : l’accès gratuit dispose d’un quota de temps de GPU quotidien (documentation Hugging Face : 2 minutes en anonyme, 5 minutes avec compte gratuit), de files d’attente et de restrictions éventuelles. Les clips peuvent échouer et ne sont pas garantis. Les paramètres proposés par le modèle sont approximativement de 0,3 à 8,5 s. Le backend et les capacités du Space tiers peuvent changer.
- **Test réel non confirmé à ce jour :** le code est enregistré sur GitHub et validé statiquement par des tests de protocole simulés, mais aucune génération IA de bout en bout n’a été confirmée depuis un navigateur Android avec réception d’un MP4. Un échec CORS ou un quota saturé reste possible.
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

## V6 — Réalisateur autonome et générateur vidéo 22B

- Moteur choisi par défaut : [LTX-2.3 (Lightricks)](https://huggingface.co/spaces/Lightricks/LTX-2-3), 22B et audio-vidéo. Le Space officiel expose une fonction de génération à 8 entrées. Nous découvrons son endpoint via `/gradio_api/info`, puis envoyons la tâche Gradio et attendons le MP4 par événements SSE. Le schéma peut changer à tout moment.
- Second moteur gratuit : LTX 13B Distilled. **Aucun basculement automatique vers Agnes ou un service facturé.**
- Le mode autonome transforme une idée en **storyboard déterministe structuré** de 3, 4 ou 6 plans cinématographiques (cadrages / caméra / action / lumière), avec bible de continuité visuelle. Ce n’est **pas** un scénariste LLM : le découpage suit des règles et prompts préétablis.
- Les plans sont générés séquentiellement, avec contrôle de décodabilité (dimension, durée) avant ajout à la médiathèque et à la timeline. Aucun clip inventé ni faux succès. Si le MP4 peut être copié en mémoire locale, la dernière image peut guider le plan suivant (continuité **tentée**, jamais garantie).
- L’app essaie ensuite d’assembler et de télécharger le film (fondu visuel 0,24 s, fondu audio aux coupes, piste musicale conservée, durée audio ajustée à la fin des plans). Sortie MP4 si support navigateur, sinon WebM. Les échecs de permission/autoplay/CORS/mémoire sont explicitement indiqués.
- Une nouvelle production automatique remet à zéro la piste vidéo et la piste des titres, mais conserve l’audio de l’utilisateur. Une tâche interrompue laisse intacts les médias déjà reçus ; la reprise est toujours une action volontaire, sans répétition automatique des requêtes de génération.
- **Conditions réelles** : laisser la page au premier plan, ressources GPU partagées avec quotas journaliers ; CORS, expiration des URL, taille mémoire du smartphone et décodage peuvent empêcher le master. Le lancement asynchrone de l’export peut nécessiter une nouvelle interaction utilisateur sur certains navigateurs.
- Les **sources ne sont pas du 4K garanti** : LTX-2.3 utilise ici des trames jusqu’à environ 1536 × 864 en horizontal, sous réserve d'acceptation GPU. Un export Full HD effectue un redimensionnement et ne constitue pas un nouveau rendu IA en 4K.
- **Validation effectuée** : contrôles statiques et tests simulant la réception d’événements SSE et d’une URL MP4 ; **pas de véritable film IA généré et joué sur Android vérifié dans cette session**. Cette distinction est importante.
- Documentation vérifiée : [Space officiel LTX-2.3 — app.py](https://huggingface.co/spaces/Lightricks/LTX-2-3/blob/main/app.py), [ZeroGPU — quotas et limites](https://huggingface.co/docs/hub/spaces-zerogpu).

## Sauvegarde portable — médias et audio (22 novembre 2026)

Le code du studio propose désormais un export ZIP contenant le projet, un index des images/vidéos récupérables et un index des **sources audio de la timeline** récupérables. Les médias impossibles à télécharger (CORS, URL expirée, permissions, espace mémoire) sont signalés dans `media-non-disponibles.txt`. Le ZIP est importable depuis le panneau « Reprendre un projet » et la timeline ne doit être remplacée qu'après confirmation. L'import JSON seul ne restaure pas les URL `blob:` périmées.

Un lien de téléchargement manuel reste accessible cinq minutes après la préparation d'un export pour les navigateurs qui bloquent les téléchargements automatiques après calcul asynchrone. Ces changements sont **committés**, sans validation sur appareil ni preuve de nouveau déploiement en production. [Procédure et limites détaillées](SAUVEGARDE_MEDIA.md).
