# MotionLibre 1.1 IA — studio vidéo et assistant de prompts

Version de MotionLibre intégrée à **IA Studio Ciné** dans un dossier indépendant.

## Démarrage
Ouvrir [index.html](./index.html) dans un navigateur mobile ou de bureau. Le fichier est autonome : HTML, CSS et JavaScript y sont intégrés. Importer une photo, ouvrir « Assistant IA · prompts vidéo », décrire la scène, choisir le fournisseur, générer, corriger si nécessaire et cliquer sur « Appliquer à la photo ».

**Important :** l'IA génère le texte des prompts, pas les pixels d'une vidéo générative. L'application réalise des déplacements de caméra, effets visuels, colorimétrie, fondus et un export vidéo sur les photos de l'utilisateur.

## Choix du moteur
- **Sur l'appareil (par défaut)** : modèle open source [SmolLM2-135M-Instruct-ONNX-MHA](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA), quantification Q4, avec [Transformers.js 3.8.1](https://huggingface.co/docs/transformers.js/v3.8.1/en/installation) sur WebAssembly. Le premier usage télécharge les poids du modèle (~182 Mo) plus des ressources. Le calcul de texte fonctionne ensuite localement si le navigateur supporte l'inférence et dispose de suffisamment de RAM. Le fonctionnement hors ligne dépend du cache et n'est pas garanti.
- **Ollama local** : installer [Ollama](https://ollama.com), puis `ollama pull qwen2.5:1.5b` ou `ollama pull mistral`. Choisir le modèle et l'adresse du serveur dans MotionLibre (par défaut `http://127.0.0.1:11434`). En contexte GitHub Pages et/ou réseau local, le navigateur peut bloquer les requêtes pour CORS ou accès réseau privé ; configurer `OLLAMA_ORIGINS` uniquement pour les origines de confiance. Sur un téléphone, localhost désigne le téléphone lui-même.
- **Mistral AI en ligne (optionnel)** : entrer une clé API Mistral AI pour appeler `https://api.mistral.ai/v1/chat/completions` avec `mistral-small-latest`. L'API peut nécessiter un compte et être facturée. La politique CORS du navigateur peut bloquer les appels directs.

## Confidentialité et sécurité
Les photos, l'audio et les vidéos ne sont pas transmis aux fournisseurs de modèles. En mode Mistral AI, **seules les instructions textuelles** sont envoyées à Mistral avec la clé API. Cette clé est conservée dans le champ de la page en mémoire temporaire et **n'est jamais enregistrée dans le code ni dans localStorage**. Ne pas committer de secrets.

L'interface de prompts accepte l'édition manuelle du résultat, le copier et l'application à la photo sélectionnée. L'export vidéo utilise la prise en charge du navigateur : MP4 ou WebM selon les codecs disponibles.

## Validation
Code JavaScript contrôlé statiquement ; intégration du modèle, appels API, navigateur mobile et hébergement GitHub Pages **non testés de bout en bout**. Certains appareils peuvent manquer de mémoire pour le modèle local.

## Sources
Application originale `MotionLibre_ouvrir_sur_telephone.html` fournie par l'utilisateur et conservée sous la forme de ce dérivé autonome.
