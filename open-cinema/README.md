# STUDIO NIKO — OPEN CINEMA AI · Cinema Engine 0.1

**Application PC + mobile pour préparer un film, créer un storyboard, générer des plans avec des modèles locaux ComfyUI et rendre un master réel en 4K avec FFmpeg.** Licence MIT pour le code original du Studio. Les modèles IA et les logiciels tiers conservent leurs licences propres.

## Démarrage sans abonnement

Prérequis : **Node.js 22+**, **FFmpeg + FFprobe** installés et présents dans le `PATH`. Pas de dépendance NPM, pas de clé cloud.

```sh
npm test
npm start
```

Ouvrir `http://127.0.0.1:8787` sur l'ordinateur. Pour tester immédiatement toute la chaîne, saisir un prompt, choisir **Motion graphics originaux**, créer le découpage, puis « Réaliser et masteriser ». Cela produit un film **encodé 3840×2160 / 2160×3840 / 4096×2160 à 24 i/s** avec bande-son originale synthétisée, H.264 / AAC 48 kHz. La conformité technique est vérifiée avec FFprobe après encodage. Cela **ne constitue pas** une génération vidéo IA photoréaliste.

### Génération IA vraiment locale (zéro abonnement)

1. Installer [ComfyUI](https://github.com/Comfy-Org/ComfyUI) et le lancer localement sur `http://127.0.0.1:8188`.
2. Installer un modèle ouvert compatible avec le GPU (p. ex. [Wan 2.2](https://github.com/Wan-Video/Wan2.2)) en respectant sa licence et les exigences matérielles.
3. Pour les images, installer le checkpoint voulu, mettre son nom dans `COMFY_CHECKPOINT`, puis utiliser le workflow `workflows/image.json`. Pour la vidéo, exporter depuis ComfyUI un vrai workflow **API Format** avec un nœud enregistrant un MP4 ou WebM dans `workflows/video.json` (voir `workflows/README.md`).
4. Démarrer Studio avec `COMFY_URL=http://127.0.0.1:8188` dans son environnement. Le moteur `comfy-video` **échoue explicitement** sans modèle, workflow et GPU correctement configurés.

Les vidéos IA peuvent être générées en dessous de la 4K, puis conformées / agrandies pour un fichier 4K. **Un master 4K ne garantit pas que les détails natifs des plans soient 4K**. La résolution native doit être contrôlée séparément. Aucun modèle ni GPU ne sont livrés dans le dépôt.

### Pilotage depuis Android / iPhone

Sur le **PC** qui calcule et stocke les fichiers :

```sh
# Linux/macOS
STUDIO_HOST=0.0.0.0 STUDIO_TOKEN='une-longue-phrase-secrete' npm start
# Windows PowerShell
$env:STUDIO_HOST='0.0.0.0'; $env:STUDIO_TOKEN='une-longue-phrase-secrete'; npm start
```

Sur le **téléphone connecté au même Wi-Fi**, ouvrir `http://ADRESSE_IP_DU_PC:8787`, cliquer sur ⚙ et fournir le code. Ne publiez **pas** le port 8787 ni le port ComfyUI sur Internet. Pour installation PWA et accès extérieur, utilisez un tunnel privé sécurisé et HTTPS, par exemple un réseau Tailscale et un reverse proxy HTTPS. Sur un réseau local non chiffré, le contenu de la session n'est pas protégé de l'écoute réseau.

Le PC assure **génération IA + rendu 4K**. Le téléphone pilote les plans, les prompts, les réglages et lit le master fini depuis son navigateur. L'app peut aussi importer et prévisualiser des rushes sur mobile, avec export d'**aperçu** (non master).

## Workflow

1. **Prompt de réalisation** et format : UHD 4K horizontal, UHD vertical 4K, DCI 4K et carré.
2. **Storyboard éditable** avec mouvements de caméra, durées et réordonnancement.
3. **Génération** : visuels procéduraux originaux ou ComfyUI local (images / vidéo), sans bascule silencieuse vers un service payant.
4. **Conformation et montage** : décodage, recadrage, étalonnage RGB, fondus, concaténation.
5. **Audio** : son synchronisé des vidéos générées lorsqu'il existe, bande-son originale synthétisée ou musique de l'utilisateur, mixage, normalisation FFmpeg `loudnorm` cible -14 LUFS (passage unique, **pas une certification LUFS**).
6. **Master** : MP4, H.264, 24 i/s, Rec.709 signalé, audio AAC 48 kHz stéréo, `faststart`, vérification des dimensions / fréquence / codecs / présence audio / durée.

## Limites connues et sécurité

- **Pas encore un concurrent démontré de Kling** en qualité générative, contrôle temporel ou cohérence des personnages. Ces résultats dépendront fortement du workflow ComfyUI et du GPU. Le storyboard par défaut est un découpage déterministe, pas un scénariste LLM. Un LLM local pourra être intégré ultérieurement.
- **4K consomme fortement** CPU, RAM, GPU et stockage ; sur PC peu puissant les rendus seront lents. Une génération 4K native n'est pas assurée par les modèles vidéo cités.
- Les masters sont conservés sur le disque du PC dans `data/jobs`, exclu de Git. Les jobs actifs ne survivent pas à un redémarrage du serveur ; les médias déjà rendus restent sur disque mais la reprise après redémarrage n'est pas encore implémentée.
- Le projet JSON sauvegarde le découpage et les références, pas les fichiers médias locaux ; réimporter les sources manuelles est nécessaire.
- Le serveur ne contacte pas Agnes AI et n'utilise aucune carte bancaire ni crédit cloud. Une intégration Agnes payante devra être séparée et explicitement autorisée.
- L'application n'est pas un étalonneur ACES ni un outil certifié broadcast ; le filtre FFmpeg `eq` est une finition colorimétrique simple.
- Accès réseau non chiffré à éviter : en LAN, utiliser code de session et idéalement HTTPS. Le serveur refuse l'ouverture réseau sans mot de passe.

## Tests et transparence

`npm test` vérifie le découpage, le parsing des workflows, les profils 4K et l'intégrité des images. `npm run check` valide la syntaxe. Les tests FFmpeg / rendu réel nécessitent les binaires disponibles localement ; voir `test/integration` pour les validations complémentaires. Ne jamais qualifier une fonctionnalité de validée sur Android ou une génération ComfyUI réelle sans essai sur le matériel et les modèles concernés.

## 0.2 — AI VFX LAB (modèles spécialisés, optionnels)

Le nouvel onglet **AI VFX LAB** traite un vrai rush vidéo via ComfyUI, sur PC et depuis une interface mobile. Il inclut le routage d'intention, huit effets spécialisés (VOID/SAM3, VACE/LTX, SeedVR2, Depth Anything), le transfert contrôlé des sources, la progression GPU, la conformation 4K, le contrôle FFprobe, un aperçu et l'ajout du résultat à la timeline.

**Aucune intelligence artificielle n'est imitée :** pour activer un effet, il faut exporter son vrai workflow ComfyUI au format API dans `workflows/vfx/` et installer ses poids (voir [workflows/vfx/README.md](workflows/vfx/README.md)). Sans modèle, l'application explique ce qui manque. L'onglet respecte les limites des formats et des 15 secondes par clip pour cette première implémentation.

Les modèles les plus récents ne garantissent pas la meilleure qualité sur chaque plan. La certification 4K est une validation des paramètres de fichier et non de son piqué réel, de la cohérence d'un personnage ou de la qualité artistique. Aucune revendication de supériorité universelle n'est faite sans benchmark.
