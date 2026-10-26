# META-STUDIO PRO V5 — Studio Niko Design

Studio cinéma dans le navigateur : génération Agnes AI, médiathèque, timeline, traitement d’image et audio, exports de projets. Interface française, HTML/CSS/JavaScript natifs.

**Page principale :** [index.html](./index.html) — **Version :** 5.0.

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
- **Export :** médias sources sans transcodage, ZIP, projet JSON, EDL, OTIO JSON et FCPXML référentiel.

## Limitations honnêtes
- La génération Agnes nécessite une clé et une connexion réseau, et n’a pas été testée ici avec une clé réelle. Les quotas et tarifs restent ceux du fournisseur.
- Les URL blob: locales expirent après fermeture du navigateur ; les URL CDN distantes peuvent expirer. L’export ZIP dépend de la disponibilité et du CORS des médias.
- **Pas de rendu MP4 de la timeline**, de mixage audio final encodé, de ProRes/DNxHR ou de serveur de rendu intégré.
- **Pas d’ACES officiel** : looks RGB natifs uniquement.
- **Pas d’EBU R128 / LUFS conforme** : le compteur est un RMS dBFS.
- **Pas de SlimSAM, Depth Anything ou Swin2SR installés** : les outils locaux sont algorithmiques.
- Les exports de montage décrivent structure et liens médias, et peuvent nécessiter un relink dans le logiciel cible.

## Sécurité
Aucune clé API n’est enregistrée dans le dépôt, localStorage, sessionStorage, les journaux ou les exports. Les clés sont conservées seulement dans la mémoire de l’onglet. Elles sont néanmoins visibles par le navigateur et transmises directement au fournisseur ; pour une protection renforcée, un proxy serveur authentifié est nécessaire.

## Validation
La CI GitHub teste la syntaxe de meta-studio-v5-core.js et meta-studio-v5-media.js avec node --check, puis les identifiants HTML, les dépendances et l’absence de stockage de clés grâce à node verify-v5.mjs. Cela ne remplace pas des tests de bout en bout avec Agnes ou un logiciel de montage.

## Modules historiques conservés
Le dépôt conserve niko-genesis/ (NIKO STUDIO — CINÉ GENESIS), motionlibre/, wangp_bridge.html et leur historique. La page principale de l’ancien AI STUDIO PRO a été remplacée ; les autres modules ne sont pas supprimés.

**Studio Niko Design — Nicolas Julienne.**
