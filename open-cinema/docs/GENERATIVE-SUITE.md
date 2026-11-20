# Generative Suite — v0.3

La suite, accessible dans l’onglet **Suite générative** sur PC et téléphone, prend en charge :

1. Rédaction d’une intention et compilation **déterministe** d’un prompt de réalisateur (ce n’est pas un LLM autonome).
2. Import et sélection des médias depuis PC/mobile : JPEG, PNG, WebP, MP4, MOV, WebM, MP3, WAV, FLAC, OGG, M4A, selon les décodeurs FFmpeg installés. Taille maximale : **250 MiB par fichier**. Le serveur vérifie les fichiers avec FFprobe.
3. Assemblage automatique de 1 à 12 images ou vidéos importées en master 4K via FFmpeg ; bande-son importée ou audio original synthétisé.
4. Référence visuelle facultative pour ComfyUI : une **seule image** est envoyée à `LoadImage` lorsque le workflow API comporte `{{SOURCE_IMAGE}}` ou `{{INPUT_FILE}}`. Dans le cas contraire, erreur explicite.
5. Storyboard modifiable, génération par workflow ComfyUI, mastering H.264 et vérification technique du master via FFprobe.

**Important :** Les modes `comfy-image` et `comfy-video` exigent un modèle compatible, des nœuds et des workflows ComfyUI réellement installés. Sans ceux-ci, la génération est indisponible ; aucune image fictive ne sera présentée comme une création IA. Le mode `imported` assemble de vrais rushes mais ne crée pas de nouveaux plans IA. La sortie 4K ne signifie pas qu’une source 720p acquiert des détails 4K natifs.

Les fichiers téléversés sont enregistrés uniquement sur le PC dans `data/assets`, hors Git. Sur mobile, privilégier un tunnel HTTPS ou un VPN privé, et ne jamais exposer directement le serveur ComfyUI sur Internet. Les médias locaux ne sont pas automatiquement conservés par le navigateur après fermeture ; conserver les originaux. Les clés Agnes sont facultatives.
