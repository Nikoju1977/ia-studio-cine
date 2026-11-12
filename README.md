# META-STUDIO PRO V5 — Studio Niko Design

Studio cinéma dans le navigateur : génération Agnes AI, médiathèque, timeline, traitement d’image et audio, exports de projets. Interface française, HTML/CSS/JavaScript natifs.

**Page principale :** [index.html](./index.html) — **Version :** 5.1.

## Démarrage
1. Lancer un serveur statique dans ce dossier : python3 -m http.server 8000
2. Ouvrir http://localhost:8000
3. Importer des images et vidéos, ou utiliser une clé privée Agnes pour les générer.
4. Ajouter les résultats à la timeline, créer des overlays, appliquer les looks et exporter.

Les modules JavaScript nécessitent HTTP/HTTPS. Sur GitHub Pages ou tout hébergement statique, les appels à Agnes peuvent être bloqués par la politique CORS. Un proxy HTTPS sécurisé est recommandé dans un contexte partagé, non livré dans V5.

## Fonctionnalités

- **Agnes :** chat, image, vidéo via Agnes Video v2.0 ; suivi par video_id, annulation locale, reprises réseau et respect du Retry-After lors d’un code 429. Plusieurs clés peuvent être chargées en mémoire, sans garantie de quota supplémentaire.
- **Médiathèque :** imports locaux image et vidéo, previews, ajout à la timeline.
- **Montage :** trois pistes vidéo/audio/texte, déplacements, coupes conservant les in-points, suppression, scrub et prévisualisation à 24 i/s.
- **Color Lab :** six looks et lift, gamma, gain, saturation (Canvas, 8 bits).
- **Outils locaux :** masque de luminance, carte de luminance et redimensionnement x2, clairement distingués d’une véritable segmentation/profondeur/super-résolution par IA.
- **Audio :** ajout de sons, balance d’écoute des pistes, niveau dBFS RMS d’un fichier et synthèse vocale système.
- **Agent local :** commandes textuelles déterministes (pas un LLM autonome).
- **Export :** véritable film assemblé HD/Full HD avec titres et mixage des pistes audio grâce à Canvas, Web Audio et MediaRecorder (WebM/MP4 selon navigateur), plus médias sources, ZIP, projet JSON, EDL, OTIO JSON et FCPXML référentiel.

## Limitations honnêtes
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
