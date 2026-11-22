# META-STUDIO PRO — Sauvegarde et récupération des projets

## Formats réellement gérés dans le code

- **JSON V5** : description de la médiathèque, clips (vidéo, audio et overlays), timeline et position de lecture. Il **n'embarque aucun fichier binaire**. Une URL `blob:` locale n'est pas réutilisable après fermeture de la page.
- **ZIP** : `project.json`, `media-index.json` (correspondances identifiants → fichiers), fichiers présents dans `media/`, `audio-index.json` et les pistes audio récupérables dans `audio/`, et, en cas d'échec, `media-non-disponibles.txt`. Seuls les médias de la médiathèque et les sources audio des clips de la timeline récupérables avec les permissions navigateur et les règles CORS sont inclus.
- **Import ZIP** : reconstitution de l'index des médias, des pistes audio et de la timeline à partir de l'archive, avec création d'URLs locales temporaires. Ne transforme pas les fichiers en stockage persistant indépendant.
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

## Récupération après interruption — nouvelle intégration du 22 novembre 2026

L'onglet **Reprendre un projet** dispose d'une section discrète **Récupération après fermeture ou interruption**. Le navigateur essaie de garder deux générations de sauvegardes de la **structure** du montage (médias référencés, clips vidéo/audio/titres, timecode et durée). Un changement déclenche une sauvegarde différée, avec consolidation lorsque la page devient invisible et contrôle périodique quand elle reste ouverte.

L'utilisateur choisit explicitement **Restaurer la dernière**, **Version précédente**, **Exporter le secours JSON** ou **Effacer les copies locales**. La restauration réutilise la validation et la confirmation d'import habituelles : elle ne prétend pas restaurer les vidéos, enregistrements ou fichiers éphémères contenus dans les URL `blob:`. La sauvegarde de secours est limitée à environ **1,4 Mo de JSON** et les anciennes générations peuvent être effacées par le navigateur, notamment sous pression mémoire ou si l'espace disque est saturé. Deux générations ne sont pas un historique illimité.

Les copies restent dans le stockage local du domaine ; les noms et prompts du projet sont enregistrés **en clair dans ce navigateur**, sans synchronisation ni sauvegarde cloud. Ne place pas de secrets ou de données confidentielles dans les noms ou prompts que tu souhaites sauvegarder. Pour un vrai master récupérable sur un autre appareil, exporte également le ZIP avec ses sources audio et vidéo récupérables et conserve les médias originaux.

**État de livraison :** code GitHub enregistré, sans preuve de restauration réussie sur iPhone ni redéploiement Vercel confirmé pour cette version.
