# Lot E (1.3.6) : migration de schéma, fichiers et réglages serveur

## Ce qui change dans le schéma

Le script `pocketbase/scripts/migrer-lot-e.mjs` n'ajoute que des collections, des champs et deux enregistrements de départ. Il ne modifie ni ne supprime aucune donnée existante. Fragment pour `collections.json` : `pocketbase/config/collections-lot-e.json`.

| Collection | Point | Contenu | Lecture | Écriture |
|---|---|---|---|---|
| `GameCategory` (nouvelle) | 1 | `slot` (game / playmobile, unique), `name`, `order` ; 2 enregistrements de départ : « Chay Game », « Chay PlayMobile » | membres | admins : nom seulement (création et suppression : personne) |
| `GameClassement` (nouvelle) | 1 | `game_id` (unique : un jeu = une catégorie), `slot` | membres | admins |
| `ChristianNews` (nouvelle) | 2 | `title`, `summary`, `body`, `cover_url`, `link_url`, `order`, `view_count` | membres | admins |
| `Wallpaper` (nouvelle) | 3 | `title`, `image_url`, `thumb_url` (vignette), `order` | membres | admins |
| `MissionRequest` (nouvelle) | 4 | identité, `age`, `phone`, `address`, `kind`, `other_text`, `details`, `status` | **admins seulement** (données personnelles) | création : route `createMissionRequest` seulement ; admins : statut, suppression |
| `YouTubeVideo`, `Article` | 5 | nouveau champ `view_count` | inchangé | inchangé (le compteur est écrit par la route `compterVue`) |
| `MediaVue` (nouvelle) | 5 | journal anti-doublon (`user_id`, `cle`) | personne (règles `null`) | route `compterVue` seulement |
| `VersionAnnonce` (nouvelle) | 6 | une ligne par version annoncée (`version_code` unique), file d'e-mails | admins | routes seulement |

Pour les titres de Musique, de Prédication et des films, le compteur reste `PlaylistTrack.listen_count`, qui existe déjà.

**Non exécutée** sur le bac à sable : la migration n'a tourné que sur une copie jetable du bac à sable (port 8095), effacée après les tests.

## Ordre de déploiement

1. **Migration**, avant les hooks : les nouvelles routes lisent ces collections.

   🪟 PC : ouvrir le tunnel dans une fenêtre à part.

   ```powershell
   ssh -N -L 8092:127.0.0.1:8090 $SERVEUR
   ```

   Puis, dans une autre fenêtre :

   ```powershell
   cd C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration
   $env:PB_URL = "http://127.0.0.1:8092"
   $env:PB_EMAIL = Read-Host "E-mail superuser"
   $s = Read-Host "Mot de passe superuser" -AsSecureString
   $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
   $env:PB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
   [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b); Remove-Variable s, b
   node pocketbase/scripts/migrer-lot-e.mjs
   node pocketbase/scripts/migrer-lot-e.mjs --appliquer
   Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL
   ```

   Lancé sans option, le script ne fait qu'une simulation. Elle doit annoncer :
   - 7 nouvelles collections : `GameCategory`, `GameClassement`, `ChristianNews`, `Wallpaper`, `MissionRequest`, `MediaVue`, `VersionAnnonce` ;
   - 2 champs : `YouTubeVideo.view_count` et `Article.view_count` ;
   - 2 enregistrements de départ : `GameCategory` « Chay Game » et « Chay PlayMobile ».

   Le script peut être relancé : il répond « Déjà à jour ». Il complète aussi une collection du lot déjà créée à laquelle il manquerait un champ. Ensuite, exporter les collections pour mettre à jour `C:\Export-Base44\_outil\pb\collections.json`.

2. **Fichiers serveur** (`pocketbase/pb_hooks/`).

   Nouveaux fichiers :

   | Fichier | Contenu |
   |---|---|
   | `missions.pb.js` + `lib/missions.js` | route `createMissionRequest` |
   | `vues.pb.js` + `lib/vues.js` | route `compterVue` |
   | `versions.pb.js` + `lib/annonceVersion.js` | route `annoncerVersion` et tâche `annonce_version` |

   Fichiers modifiés :

   | Fichier | Changement |
   |---|---|
   | `fichiers.pb.js` + `lib/televersement.js` | audio et images acceptés sur R2 |
   | `lib/cibles.js` | notification « Nouvelle version » → « À propos » |
   | `zz_demarrage.pb.js` | commentaire seulement |

   Redémarrer PocketBase : il ne recharge pas les hooks tout seul. Le journal doit afficher :
   `6 tâches planifiées (annonce_version, fichiers_orphelins, push_reessais, reunions_archivage, televersements_incomplets, verset_du_jour)`.

3. **Site**, puis **APK 1.3.6**. L'APK contient un nouveau plugin natif `ChayGalerie` (fonds d'écran) et la permission `WRITE_EXTERNAL_STORAGE`, limitée à Android 9 et moins : il faut donc reconstruire l'APK.

4. **Annonce de la version** : panneau admin › Équipe › « Annoncer une mise à jour ». À faire une fois l'APK publié (`publier-apk.mjs`) et `latest.json` en ligne.

## Réglages serveur

- **Variables d'environnement** : aucune nouvelle variable obligatoire.
  - `ANNONCE_LOT_EMAILS` est facultative : c'est la taille des lots d'e-mails de l'annonce, 40 par défaut.
  - `NOTIFICATIONS_MODE=on` est nécessaire pour que les e-mails partent, comme pour les autres notifications.
- **Caddy** : **aucun changement nécessaire** pour l'audio de 1 Go ni pour les images de 200 Mo.
  - Le bloc `api.chay.fr` (`docs/CADDY-APP.md`) ne fixe aucune limite de corps de requête.
  - Les fichiers de plus de 15 Mo passent par Caddy en morceaux de 8 Mo au plus (`upload_chunk`).
  - Ceux de plus de 100 Mo vont directement du téléphone ou du navigateur vers R2 (URL présignées), sans passer par Caddy.
  - Si le Caddyfile du serveur contient un `request_body { max_size … }` pour `api.chay.fr`, il doit valoir au moins 16 Mo.
- **PocketBase** : `maxSize` de `FichierAdmin` inchangé (100 Mo). Au-delà de 100 Mo, les fichiers vont sur R2, pour que les sauvegardes de PocketBase restent petites.
- **R2** : rien à changer.
  - Le CORS du bucket autorise déjà `PUT` et `GET` : le `GET` sert au téléchargement des fonds d'écran depuis le navigateur.
  - L'audio et les images de plus de 100 Mo sont rangés sous le même préfixe `videos/`. La règle « abandon des envois incomplets après 1 jour » les couvre donc aussi.

## Erreur 415 sur les gros mp3 : diagnostic

Au-delà de 100 Mo, `src/lib/upload.js` envoyait tout fichier vers R2 (`initMultipartUpload`). Cette route n'acceptait que les vidéos et répondait 415 « Seules les vidéos… », sur le site comme dans l'app. Un test existant imposait même ce refus.

Ni Caddy ni le `maxSize` de PocketBase n'étaient en cause.

Le correctif :
- **Familles acceptées sur R2** : l'audio jusqu'à 1 Go (mp3, m4a, aac, wav, ogg, opus, flac) et les images jusqu'à 200 Mo, en plus des vidéos.
- **Contrôles** : le type annoncé doit correspondre à la famille. Après l'assemblage, le contenu est vérifié :
  - audio : ID3 ou trame MPEG, FLAC, Ogg, WAV, m4a ;
  - images : JPEG, PNG, GIF, WebP, HEIC.

  Un contenu qui ne correspond pas est supprimé, avec une réponse 415.
- **Refus avant l'envoi** : l'app refuse avant tout envoi un fichier au-delà de son plafond, avec un message clair.

## Comportements à connaître

- **Jeux** : un jeu non classé est invisible des membres.
  - Les admins le voient sur la page Jeux, sous « À classer ».
  - Le tableau de bord admin affiche une demande de classement par jeu.
- **Vues** :
  - **Audio et vidéo** : +1 à la moitié de la lecture, une fois par ouverture.
  - **Articles et actualités** : +1 après 2 minutes de lecture, onglet visible.
  - **Anti-doublon serveur** : une nouvelle vue du même membre sur le même contenu est ignorée pendant 30 minutes.
  - **Hors compteur** : la radio (direct), la galerie et les fonds d'écran.
  - **Anciennes versions de l'APK** : les APK 1.3.5 et antérieures comptent encore avec les anciennes routes `recordMediaListen` et `recordVideoView`, conservées.
- **Se missionner** : un e-mail est envoyé à chaque admin actif, et la demande apparaît dans le panneau admin › Engagement › Se missionner. Limite : 5 demandes par membre et par 24 h.
- **Annonce de version** :
  - **Étapes** : un aperçu, puis la confirmation « Envoyer à N membres ? ».
  - **Destinataires** : les préférences des membres sont respectées (« Nouvelle version », e-mail, push).
  - **Anti-doublon** : un même code de version ne peut être annoncé qu'une fois (index unique). Une seconde annonce reçoit une réponse 409.
  - **Envoi** : le push part tout de suite ; les e-mails partent par lots, chaque minute.
  - **Toucher la notification** : ouvre « À propos », avec le bouton de téléchargement.
