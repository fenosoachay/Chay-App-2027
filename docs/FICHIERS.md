# Fichiers (photos, audio, vidéos) avec PocketBase

## Où va quoi

**Règle** : toutes les **vidéos** (mp4, m4v, mov, webm, mkv) vont sur R2, **quelle que soit leur taille**. PocketBase ne garde que les images, l'audio et les petits documents : ses sauvegardes restent petites.

| Taille / type | Destination | Qui | Comment |
|---|---|---|---|
| **Vidéo**, de 1 octet à 5 Go | Cloudflare R2 | admin | routes `initMultipartUpload`, `getPresignedUrl`, `completeMultipartUpload` : les octets vont du navigateur à R2, en parts de 8 Mo (une seule part, même de moins de 5 Mo, pour une petite vidéo) |
| ≤ 15 Mo, image ou audio | collection `Fichier` | membre connecté | `Core.UploadFile` (adaptateur) |
| ≤ 15 Mo, image, audio, PDF | collection `FichierAdmin` | admin | `Core.UploadFile` (adaptateur) |
| 15 à 100 Mo, sauf vidéo | `FichierAdmin` | admin | route `upload_chunk`, morceaux de 8 Mo, reprise possible |
| **Audio** de 100 Mo à 1 Go, **image** de 100 à 200 Mo | Cloudflare R2 | admin | mêmes routes que les vidéos (clé `videos/AAAA/MM/…<ext>`, type `audio/…` ou `image/…`, contenu contrôlé à la fin : ID3/MPEG, FLAC, Ogg, WAV, m4a ; JPEG, PNG, GIF, WebP, HEIC) |
| Autre type de plus de 100 Mo | refusé par l'app avant tout envoi | | |

**Erreur 415 sur un gros mp3 (corrigée en 1.3.6)** : au-delà de 100 Mo, l'app envoyait l'audio vers R2, dont la route n'acceptait que les vidéos (415 « Seules les vidéos… »). Ni Caddy ni `maxSize` n'étaient en cause : les requêtes passant par Caddy font au plus 8 Mo (morceaux) et les parts R2 vont directement du navigateur à R2.

Les entités gardent une **adresse en texte** (`avatar_url`, `image_urls[]`, `audio_url`, `video_url`…), comme avec Base44. Le choix se fait dans `src/lib/upload.js` (mode PocketBase seulement) : d'abord le type (vidéo d'après `video/*` ou l'extension), puis la taille. Le mode Base44 est inchangé.

Une vidéo envoyée dans `Fichier` / `FichierAdmin` ou par `upload_chunk` est refusée (415 « Les vidéos sont envoyées vers le stockage vidéo (R2), pas dans PocketBase »). Le contrôle porte sur l'extension. À la prochaine importation du schéma, retirer aussi `video/*` des types autorisés de `FichierAdmin`, pour une seconde protection basée sur le contenu.

## Contrôles côté serveur

- **Propriétaire** imposé par le serveur (`e.auth.id`) ; une requête qui en annonce un autre est refusée.
- **Taille et type réel** : PocketBase lit le contenu (pas l'extension). `Fichier` : images (jpeg, png, webp, gif, heic, heif, avif) et audio (mpeg, mp4, m4a, aac, ogg, wav, webm, flac), 15 Mo. `FichierAdmin` : en plus PDF, 100 Mo. Les types vidéo y figurent encore dans le schéma, mais les hooks refusent les vidéos.
- **Nom imprévisible** : identifiant de 24 caractères hexadécimaux + nom aléatoire `f_<20 caractères>.<ext>`. Le nom d'origine n'est pas conservé.
- **Lecture** : les fichiers sont publics à qui connaît l'adresse, comme sur Base44. La liste des enregistrements `Fichier` est limitée au propriétaire et aux admins.
- **Pas de modification** d'un fichier : on en crée un autre. Suppression : le propriétaire (`Fichier`) ou un admin.
- **R2** : clé imposée par le serveur (`videos/AAAA/MM/<aléatoire>-<titre>.<ext>`), taille de chaque part signée dans l'URL présignée (`content-length`, valable 15 min), parts relues dans R2 avant l'assemblage (les ETags du client sont ignorés), premiers octets contrôlés après l'assemblage (sinon objet supprimé, réponse 415).
- Sessions de téléversement (`UploadSession`) accessibles **uniquement** par les routes (règles `null`).

## Nettoyage

| Quoi | Quand | Comment |
|---|---|---|
| Sessions de plus de 24 h (morceaux sur disque, téléversements R2 abandonnés) | toutes les heures (`17 * * * *`, tâche `televersements_incomplets`) | aussi à la demande : `POST /api/fn/cleanupIncompleteUploads` (admin) |
| Téléversements R2 sans session, de plus de 24 h | même tâche | `ListMultipartUploads` sous `videos/` puis abandon |
| Fichiers non référencés depuis plus de 7 jours | le dimanche à 3 h 30 (`fichiers_orphelins`) | une adresse `/api/files/…/<id>/` présente dans un champ texte, url, éditeur ou json de n'importe quelle collection compte comme une référence. Par prudence, rien n'est supprimé si aucune référence n'est trouvée alors qu'il y a plus de 20 candidats. À la demande : `POST /api/fn/cleanupOrphanFiles` (superuser, simulation par défaut) |

Les objets R2 non référencés ne sont **pas** supprimés automatiquement.

## Cloudflare R2 : ce qu'il faut préparer

1. **Bucket** (le bucket actuel `chay-videos` ou un nouveau).
2. **Jeton API R2** limité à ce bucket, droits « Object Read & Write ». Il donne `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY`.
3. **Domaine public** du bucket (par exemple `media.chay.fr`, ou l'adresse `r2.dev` du bucket) → `R2_PUBLIC_BASE_URL`. Sans lui, les vidéos ne se lisent pas : le point d'accès `*.r2.cloudflarestorage.com` exige une signature.
4. **CORS** du bucket :

```json
[
  {
    "AllowedOrigins": ["https://membres.chay.fr", "https://localhost", "capacitor://localhost"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

(remplacer les origines par celles de l'app web et de l'APK ; `ETag` exposé est indispensable).

5. **Règle de cycle de vie** : « Abandonner les téléversements multipart incomplets après **1 jour** » (Settings du bucket → Object lifecycle rules → *Abort incomplete multipart uploads*, préfixe `videos/`). Elle double la tâche horaire et ne demande aucun code.
6. **Variables d'environnement** du processus PocketBase (jamais dans le dépôt) :

```
R2_ENDPOINT=https://<id-du-compte>.r2.cloudflarestorage.com
R2_BUCKET=chay-videos
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://media.chay.fr
R2_PREFIX=videos
CHAY_PUBLIC_URL=https://api.chay.fr
```

Sans configuration R2, les routes vidéo répondent 500 « Stockage vidéo (R2) non configuré » ; le reste fonctionne.

## Migration des fichiers existants (jour J)

`pocketbase/scripts/migrer-fichiers.mjs` : simulation par défaut, `--appliquer` pour envoyer et réécrire. Il refuse pour l'instant toute autre machine que `127.0.0.1` ; à lever au basculement.

- 125 références `base44.app` → 64 fichiers distincts. L'un d'eux est une page de l'app (lien dans un message), il reste donc 63 fichiers ; chacun est envoyé une seule fois (réutilisé s'il existe déjà, par son empreinte `sha256`).
- `Fichier` (10) quand toutes les références viennent d'un même membre (profil, publication, message, playlist personnelle) et que le fichier fait 15 Mo au plus ; sinon `FichierAdmin` (52).
- Photo HEIC : convertie en JPEG hors ligne, par les codecs Windows (« Extensions vidéo HEVC ») ou, à défaut, par le paquet npm `heic-convert` installé **hors du dépôt** dans `C:\Export-Base44\_outil\heic-convert\` (`npm install heic-convert@2`). Le JPEG n'a pas d'EXIF (pas de position GPS). Dernier recours : déposer le JPEG dans `C:\Export-Base44\_outil\pb\heic-jpeg\<sha256>.jpg`, ou `--heic-tel-quel`. Bac à sable : la photo existante est convertie et ses 2 adresses vérifiées.
- Vidéos MP4, **toutes tailles** (dont celle de 1,87 Go) : vers R2 avec `--avec-video --r2-env <fichier>` (envoi multipart), jamais dans PocketBase. Sans l'option, elles sont reportées. Leurs adresses sont réécrites vers l'adresse publique R2, puis relues et comparées au fichier d'origine.
- Réécriture : champs simples et listes `image_urls[i]`, seulement si la valeur est encore l'ancienne adresse. Les dates de mise à jour sont conservées.
- Les 4 adresses R2 existantes ne sont pas réécrites : elles sont listées dans le rapport.
- Sorties (hors dépôt) : `C:\Export-Base44\_outil\pb\migration-fichiers-rapport.md` et `fichiers-correspondance.csv`.

Résultat dans le bac à sable :
- 61 fichiers envoyés (sans la vidéo, faute de place sur le disque) ;
- 121 champs réécrits dans 100 enregistrements ;
- 61 adresses sur 61 relues identiques à l'original ;
- dates de mise à jour identiques à l'export ;
- relancé une seconde fois : aucun changement.

## Tests

| Test | Contenu |
|---|---|
| `pocketbase/tests/sigv4.test.mjs` | vecteurs officiels (NIST, RFC 4231, AWS S3 : GET avec Range, PUT, lifecycle, list, URL présignée, clé IAM) + 2 000 comparaisons avec `node:crypto` |
| `pocketbase/tests/fn-fichiers.integration.mjs` | membre / admin / anonyme, taille et type refusés, propriétaire falsifié, morceaux, multipart contre le faux S3, URL présignée modifiée, abandon, tâches planifiées, fichiers non référencés |
| `pocketbase/tests/fichiers.local.test.js` | vrai `upload.js` + vrai adaptateur : photo de membre, image recadrée, 20 Mo en morceaux, vidéos de 300 Ko, 20 Mo (nom avec tiret long et emoji), sans nom (webm) et 101 Mo vers R2, vidéo de membre refusée |
| `pocketbase/tests/migration-fichiers.integration.mjs` | fonctions du script et envoi multipart d'une vidéo générée |
