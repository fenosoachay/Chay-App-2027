# Fichiers (photos, audio, vidéos) avec PocketBase

## Où va quoi

| Taille / type | Destination | Qui | Comment |
|---|---|---|---|
| ≤ 15 Mo, image ou audio | collection `Fichier` | membre connecté | `Core.UploadFile` (adaptateur) |
| ≤ 15 Mo, tout type autorisé | collection `FichierAdmin` | admin | `Core.UploadFile` (adaptateur) |
| 15 à 100 Mo | `FichierAdmin` | admin | route `upload_chunk`, morceaux de 8 Mo, reprise possible |
| > 100 Mo, vidéo seulement (5 Go max) | Cloudflare R2 | admin | routes `initMultipartUpload`, `getPresignedUrl`, `completeMultipartUpload` : les octets vont du navigateur à R2 |

Les entités gardent une **adresse en texte** (`avatar_url`, `image_urls[]`, `audio_url`, `video_url`…), comme avec Base44. Le choix se fait dans `src/lib/upload.js` (mode PocketBase seulement) d'après la taille ; le mode Base44 est inchangé.

## Contrôles côté serveur

- **Propriétaire** imposé par le serveur (`e.auth.id`) ; une requête qui en annonce un autre est refusée.
- **Taille et type réel** : PocketBase lit le contenu (pas l'extension). `Fichier` : images (jpeg, png, webp, gif, heic, heif, avif) et audio (mpeg, mp4, m4a, aac, ogg, wav, webm, flac), 15 Mo. `FichierAdmin` : en plus vidéo et PDF, 100 Mo.
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
    "AllowedOrigins": ["https://chay.fr", "https://localhost", "capacitor://localhost"],
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
- Vidéo de 1,87 Go : `--avec-video --r2-env <fichier>` (envoi multipart vers R2).
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
| `pocketbase/tests/fichiers.local.test.js` | vrai `upload.js` + vrai adaptateur : photo de membre, image recadrée, 20 Mo en morceaux, vidéo de 101 Mo vers R2 |
| `pocketbase/tests/migration-fichiers.integration.mjs` | fonctions du script et envoi multipart d'une vidéo générée |
