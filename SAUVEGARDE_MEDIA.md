# META-STUDIO PRO — Sauvegarde et récupération des projets

## Formats réellement gérés dans le code

- **JSON V5** : description de la médiathèque, clips (vidéo, audio et overlays), timeline et position de lecture. Il **n'embarque aucun fichier binaire**. Une URL `blob:` locale n'est pas réutilisable après fermeture de la page.
- **ZIP** : `project.json`, `media-index.json` (correspondances identifiants → fichiers), fichiers présents dans `media/` et, en cas d'échec, `media-non-disponibles.txt`. Seuls les médias récupérables avec les permissions navigateur et les règles CORS sont inclus.
- **Import ZIP** : reconstitution de l'index des médias et de la timeline à partir de l'archive, avec création d'URLs locales temporaires. Ne transforme pas les fichiers en stockage persistant indépendant.
- **EDL/OTIO/FCPXML** : fichiers d'échange et références aux sources, pas des masters vidéo.

## Précautions

1. Avant d'importer un projet, **exporte le projet actif** : l'import demande confirmation avant de remplacer la timeline.
2. Pour transporter une production entre deux appareils, préfère le ZIP si les vidéos/images sont réellement récupérables ; garde toujours les rushes originaux séparément.
3. Le ZIP inclut un fichier `media-non-disponibles.txt` si des sources sont expirées, protégées par CORS ou inaccessibles. L'import affiche le nombre de médias reliés et de clips non restaurés.
4. Lors d'un export asynchrone, Safari peut ignorer le clic de téléchargement automatique. Dans l'onglet **Export**, utiliser le **lien manuel** pendant ses cinq minutes de validité.
5. La bibliothèque ZIP actuellement importée depuis jsDelivr nécessite une connexion pour son premier chargement. Les archives lourdes peuvent dépasser la mémoire disponible sur un téléphone.

## Limites

- Les objets médias retrouvés dans une archive deviennent des URL `blob:` pour la session navigateur. Il faut garder le ZIP d'origine pour les réimporter après fermeture.
- L'import du projet contrôle la structure avant remplacement de la timeline, mais ne garantit pas l'intégrité décodée de chaque média ni la disponibilité de toutes les URL distantes.
- L'application limite l'import JSON à 16 Mo et un ZIP à 768 Mo ; cette limite n'est pas une garantie de compatibilité ou de performance mobile.
- La prise en charge du ZIP ne garantit pas un rendu 4K, l'absence de quotas ou l'exécution d'un moteur IA.
- Aucun test physique sur iPhone/Android ni rendu vidéo de bout en bout n'est confirmé par cette modification.

**Statut :** fonctionnalités codées et committées sur GitHub le 22 novembre 2026 ; déploiement et fonctionnement réels à confirmer.
