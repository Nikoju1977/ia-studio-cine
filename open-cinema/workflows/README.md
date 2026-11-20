# ComfyUI local : workflows API

`image.json` est un exemple fonctionnel avec un **checkpoint compatible installé sur votre machine** ; définissez `COMFY_CHECKPOINT` (par exemple le nom exact du modèle placé dans `ComfyUI/models/checkpoints`). Ce fichier n'inclut aucun modèle ni poids.

Pour la **génération vidéo réelle**, installez Wan 2.2 ou un autre modèle compatible dans ComfyUI, construisez un workflow avec un **nœud de sortie enregistrant une vidéo MP4 ou WebM**, puis **Export → API Format** dans ComfyUI. Placez ce fichier sous `video.json`. Remplacez les champs à automatiser par `{{PROMPT}}`, `{{NEGATIVE}}`, `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{FRAMES}}`, `{{FPS}}`, `{{DURATION}}` selon les entrées acceptées par les nœuds du modèle. Si un nœud utilise un type différent, adaptez le workflow ; le système **ne simule pas** de vidéo si ComfyUI retourne une image.

Le port ComfyUI ne doit pas être exposé sur Internet : le backend Studio Niko est chargé de lui adresser les requêtes depuis la machine locale. Les workflows vidéo diffèrent selon les versions des nœuds et des modèles, et doivent être testés sur votre installation.
