# Bac à sable PocketBase local

Un PocketBase **0.40.6** (même version que le serveur) tourne en local sur une copie des données, pour tester la migration sans toucher au serveur réel `https://api.chay.fr`.

⚠️ La sauvegarde contient les **données réelles** (utilisateurs, messages…). Le bac à sable écoute seulement sur `127.0.0.1` : ne pas l'exposer, ne pas partager `C:\PB-local`.

## Emplacements (hors du dépôt)

| Élément | Chemin |
|---|---|
| Exécutable officiel (vérifié avec `checksums.txt` de la publication v0.40.6) | `C:\PB-local\bin\pocketbase.exe` |
| Données | `C:\PB-local\pb_data\` |
| Sauvegarde de référence | `C:\PB-local\apres-import-1.zip` |
| Journal (si lancé avec redirection) | `C:\PB-local\serve.log` |
| Hooks (dans le dépôt, branche `migration-pocketbase`) | `pocketbase\pb_hooks\` |

Le binaire, `pb_data` et les sauvegardes ne doivent **jamais** être ajoutés au dépôt (voir `.gitignore`).

## Démarrer

Dans un terminal PowerShell séparé, depuis la racine du worktree :

```powershell
New-Item -ItemType Directory -Force pocketbase\pb_hooks | Out-Null
C:\PB-local\bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=C:\PB-local\pb_data --hooksDir="$PWD\pocketbase\pb_hooks"
```

- API : http://127.0.0.1:8090/api/ — contrôle : http://127.0.0.1:8090/api/health
- Tableau de bord : http://127.0.0.1:8090/_/

Accès superuser local : la sauvegarde contient les superusers du serveur. Pour un compte propre au bac à sable (n'affecte que `C:\PB-local\pb_data`) :

```powershell
C:\PB-local\bin\pocketbase.exe superuser upsert <e-mail> <mot-de-passe> --dir=C:\PB-local\pb_data
```

### Avec le faux R2 (fichiers, bloc 4)

Les routes vidéo lisent la configuration R2 dans l'environnement du processus. Pour le bac à sable, elle vise le faux S3 local ; les clés sont dans `C:\PB-local\faux-s3.env` (créé au premier lancement du faux S3, ne pas partager) :

```powershell
Get-Content C:\PB-local\faux-s3.env | ForEach-Object { $k, $v = $_ -split '=', 2; if ($k) { Set-Item "env:$k" $v } }
C:\PB-local\bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=C:\PB-local\pb_data --hooksDir="$PWD\pocketbase\pb_hooks"
```

### Avec le push (bloc 5)

Faux FCM / Web Push et sidecar d'abord (voir plus bas), puis PocketBase avec, en plus, les deux variables du sidecar (seulement celles-là) :

```powershell
Get-Content C:\PB-local\faux-s3.env | ForEach-Object { $k, $v = $_ -split '=', 2; if ($k) { Set-Item "env:$k" $v } }
Get-Content C:\PB-local\faux-push.env | Where-Object { $_ -match '^PUSH_SIDECAR_(URL|SECRET)=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item "env:$k" $v }
C:\PB-local\bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=C:\PB-local\pb_data --hooksDir="$PWD\pocketbase\pb_hooks"
```

## Faux FCM / Web Push et sidecar push (bloc 5)

Deux terminaux, depuis le worktree :

```powershell
node pocketbase/tests/faux-push.mjs   # 127.0.0.1:9100 ; crée C:\PB-local\faux-push.env et faux-firebase-sa.json au premier lancement
Get-Content C:\PB-local\faux-push.env | ForEach-Object { $k, $v = $_ -split '=', 2; if ($k) { Set-Item "env:$k" $v } }
node pocketbase/sidecar-push/serveur.mjs   # 127.0.0.1:8091
```

- `faux-push.env` contient un secret partagé, des clés VAPID **de test** et un faux compte de service (clé RSA générée localement) : ne pas partager, jamais en production.
- `PUSH_LOCAL_ONLY=1` : le sidecar refuse toute adresse hors 127.0.0.1 (aucun envoi réel possible).
- Le faux service vérifie les signatures (JWT RS256 OAuth, JWT VAPID ES256) et refuse les requêtes mal signées. Jetons spéciaux : `invalide-*` (UNREGISTERED / 410), `absent-*` (404), `autre-cle-*` (403, abonnement créé avec une autre clé VAPID), `surcharge-*` (503 permanent), `instable-*` (503 une fois).
- **`NOTIFICATIONS_MODE`** (PocketBase **et** sidecar) : `on` pour les suites habituelles ; sans la variable, rien ne part (`off`). Test des 3 modes : relancer PocketBase et le sidecar avec `NOTIFICATIONS_MODE=off`, puis `test` (avec `NOTIFICATIONS_TEST_EMAILS=mode-liste@chay.test`), puis `on`, et lancer chaque fois `node pocketbase/tests/fn-mode-notifications.integration.mjs <mode>`.
- Les e-mails de notification partent vers le faux SMTP (`C:\PB-local\mails`). Ils contiennent les adresses des membres : ne pas partager ce dossier.

## Faux S3 local (simule Cloudflare R2)

Dans un autre terminal, depuis le worktree :

```powershell
node pocketbase/tests/faux-s3.mjs   # écoute 127.0.0.1:9000, stockage C:\PB-local\faux-s3
```

Il refuse toute requête mal signée (SigV4 recalculée avec `node:crypto`), simule le multipart, la lecture publique (`/public/<bucket>/<clé>`) et CORS (`ETag` exposé). Voir `docs/FICHIERS.md`.

⚠️ Disque : le disque C: est presque plein ; la vidéo réelle de 1,87 Go n'est pas simulée.

## Arrêter

`Ctrl+C` dans le terminal qui l'exécute, ou :

```powershell
Stop-Process -Name pocketbase
```

## Redémarrer après une modification des hooks

Sous Windows, PocketBase **ne recharge pas** `pocketbase\pb_hooks` automatiquement. Après chaque modification, depuis la racine du worktree :

```powershell
Stop-Process -Name pocketbase -ErrorAction SilentlyContinue
C:\PB-local\bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=C:\PB-local\pb_data --hooksDir="$PWD\pocketbase\pb_hooks"
```

Une erreur de syntaxe dans un hook apparaît au démarrage dans ce terminal.

## E-mails : faux serveur SMTP local

Aucun e-mail réel ne part du bac à sable. Dans un autre terminal, depuis le worktree :

```powershell
node pocketbase/tests/faux-smtp.mjs   # écoute 127.0.0.1:2525, enregistre les messages dans C:\PB-local\mails\*.eml
```

Puis appliquer la configuration d'authentification (modèles d'e-mail en français, code à usage unique, SMTP 127.0.0.1, limites de tentatives) — simulation d'abord :

```powershell
node pocketbase/scripts/configurer-auth.mjs
node pocketbase/scripts/configurer-auth.mjs --appliquer
```

Le script refuse toute autre machine que 127.0.0.1 et tout SMTP autre que 127.0.0.1. Les messages capturés contiennent des codes et des liens valables : ne pas partager `C:\PB-local\mails`.

**Limites de tentatives** : la règle par défaut de PocketBase `*:auth` (2 requêtes / 3 s) est remplacée par des règles par route (`pocketbase/config/settings-bac-a-sable.json`). En production derrière un proxy (Caddy, Nginx), régler `trustedProxy` (en-tête `X-Forwarded-For`) dans les réglages PocketBase : sinon toutes les requêtes semblent venir du proxy et **tous les membres partagent le même compteur**.

## Comptes de test (bac à sable uniquement)

`C:\PB-local\identifiants-test.txt` (hors dépôt, ne pas partager) contient, séparés par des tabulations :

| Ligne | Usage |
|---|---|
| `superuser` | superuser local (tableau de bord, scripts de test) |
| `admin` | utilisateur de l'app avec `role = "admin"` |
| `membre` | utilisateur de l'app avec `role = "user"` |
| `membre2` | second membre (`role = "user"`), pour les tests d'isolement entre utilisateurs |

Ils n'existent que dans `C:\PB-local\pb_data` : une réinitialisation depuis la sauvegarde les efface (les recréer ensuite).

## Hooks et routes

| Fichier | Contenu |
|---|---|
| `pocketbase/pb_hooks/base44_compat.pb.js` | `base44_created_date` / `base44_updated_date` tenues à jour ; valeurs par défaut à la création ; `role = "user"` par défaut |
| `pocketbase/pb_hooks/fn_pilote.pb.js` | `POST /api/fn/listCommunityUsers`, `getPrayerWall`, `recordMediaListen`, `recordVideoView` |
| `pocketbase/pb_hooks/fn_messagerie_priere.pb.js` | `createMessage`, `createPrayerRequest`, `takePrayer`, `answerPrayer` |
| `pocketbase/pb_hooks/fn_jeux.pb.js` | `quizLevels`, `quizStart`, `quizAnswer`, `quizFinish`, `quizAdminStats`, `wsLevels`, `wsStart`, `wsWord`, `wsAnswer`, `wsHint`, `wsFinish`, `wsAdminStats` |
| `pocketbase/pb_hooks/fn_conversations_dons.pb.js` | `createConversation`, `updateConversationParticipants`, `listThemeRequests`, `createDonationRequest` |
| `pocketbase/pb_hooks/fichiers.pb.js` | `Fichier` / `FichierAdmin` (propriétaire imposé, nom aléatoire) ; `upload_chunk`, `initMultipartUpload`, `getPresignedUrl`, `completeMultipartUpload`, `cleanupIncompleteUploads`, `cleanupOrphanFiles` ; tâches planifiées `televersements_incomplets` (horaire) et `fichiers_orphelins` (hebdomadaire) |
| `pocketbase/pb_hooks/fn_notifications.pb.js` | `sendFcmPush`, `sendWebPush`, `sendMessagePush`, `notifyCommunityPost`, `notifySocialInteraction`, `notifyNewContent`, `notifyDailyVerse`, `sendTestNotification`, `createCommunityPost`, `createThemeRequest`, `handleThemeRequest` ; tâches planifiées `push_reessais` (chaque minute) et `verset_du_jour` (05:00 et 06:00 UTC) |
| `pocketbase/pb_hooks/lib/notifications.js` | destinataires, préférences, in-app, e-mails, push de chaque fonction |
| `pocketbase/pb_hooks/lib/push.js` | cibles (`DeviceToken`, `WebPushSubscription`), appel du sidecar, suppression des jetons invalides, file `PushEnvoi` |
| `pocketbase/pb_hooks/lib/courriel.js` | e-mails en français (gabarit, échappement HTML, SMTP de PocketBase) |
| `pocketbase/pb_hooks/lib/fuseaux.js` | fuseaux horaires sans `Intl` (verset du jour) |
| `pocketbase/pb_hooks/lib/televersement.js` | R2 (requêtes S3 signées), sessions, morceaux sur disque, nettoyages |
| `pocketbase/pb_hooks/lib/sigv4.js` | signature AWS SigV4 en JavaScript pur |
| `pocketbase/pb_hooks/lib/conversations.js` | validation des participants, recherche de conversation directe existante |
| `pocketbase/pb_hooks/lib/fn.js` | module partagé (utilisateur via `e.auth`, connexion / admin exigés, validation, transactions, réponses et erreurs au format Base44) |
| `pocketbase/pb_hooks/lib/games.js` | règles du quiz et de Mots Mélangés (reprises de `base44/shared`) |
| `pocketbase/pb_hooks/lib/defaults.js` | valeurs par défaut (générées depuis `regles.md`) |

## Tests contre le bac à sable

```powershell
npm run test:pb-local
```

- `pocketbase/tests/fn-pilote.integration.mjs` : refus anonymes, appels membre / admin, entrées invalides, hooks ; remet les données dans leur état initial.
- `pocketbase/tests/fn-lot2.integration.mjs` : messagerie (isolement entre membres, temps réel), prière (limite quotidienne, concurrence), jeux (scores non falsifiables, crédits) ; supprime tout ce qu'il crée.
- `pocketbase/tests/fn-lot3.integration.mjs` : règles corrigées (PrayerRequest, Message, Conversation : ce qui passait avant est refusé, l'usage légitime marche), routes de conversation, `listThemeRequests`, `createDonationRequest`.
- `pocketbase/tests/fn-conversations-privees.integration.mjs` : conversations privées (admin non participant refusé, admin participant, membres, anonyme, superuser).
- `pocketbase/tests/fn-bloc3-collections.integration.mjs` : corrections de collections du bloc 3 (appareils, notifications, réactions, nom affiché, scores, listes d'identifiants).
- `pocketbase/tests/fn-auth.integration.mjs` : inscription par code, mot de passe oublié, changement d'e-mail, règles de `users`, invitation, suppression de compte, dernier administrateur (**faux SMTP requis**).
- `pocketbase/tests/fn-fichiers.integration.mjs` : fichiers (membre, admin, anonyme, taille / type, propriétaire falsifié, morceaux, multipart R2, abandon, nettoyages) (**faux S3 requis**).
- `pocketbase/tests/fn-push.integration.mjs` : push et e-mails du bloc 5 (bon destinataire, charge utile chiffrée, jetons invalides supprimés, file et réessais, préférences, anonyme refusé, limites, échappement HTML, journaux) (**faux push, sidecar et faux SMTP requis**).
- `pocketbase/tests/migration-fichiers.integration.mjs` : script de migration des fichiers (envoi R2 d'une vidéo générée).
- `pocketbase/tests/*.local.test.js` (`vitest.pb-local.config.js`) : parcours de l'app avec le vrai adaptateur et le vrai SDK (Communauté, Requêtes, conversations, authentification avec le faux SMTP, fichiers avec le vrai `upload.js` et le faux S3, écran admin EntityCrud sur ses 12 sections, badge des non-lus, notification « nouveau contenu » après un ajout admin avec le vrai `adminNotify.js`).
- `pocketbase/tests/fn-limites.integration.mjs` : limites de tentatives ; **toujours en dernier** (il épuise les compteurs pendant 60 s).

Sans bac à sable : `npm run test:pb-unit` (signature SigV4 avec les vecteurs AWS, chiffrement Web Push avec le vecteur de la RFC 8291, JWT RS256 / ES256, fuseaux horaires, échappement des e-mails, écrans MFA / OAuthConsent absents).

Les connexions des tests patientent et réessaient si elles reçoivent un 429.

Les règles de collection du bac à sable se mettent à jour par un import avec fusion (`PUT /api/collections/import`, `deleteMissing: false`) des seules collections modifiées de `collections.json`, après avoir vérifié que les identifiants de collection et de champs sont identiques.

Ces tests refusent toute adresse autre que `127.0.0.1` / `localhost` et lisent les identifiants dans `C:\PB-local\identifiants-test.txt` (variable `PB_TEST_CREDENTIALS` pour un autre chemin).

## Réinitialiser depuis la sauvegarde

PocketBase doit être arrêté.

```powershell
Stop-Process -Name pocketbase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force C:\PB-local\pb_data
Expand-Archive C:\PB-local\apres-import-1.zip -DestinationPath C:\PB-local\pb_data
```

Puis redémarrer. Une sauvegarde PocketBase est simplement le contenu de `pb_data` (`data.db`, `auxiliary.db`, `storage\` s'il y a des fichiers).

## Pointer l'app sur le bac à sable

Dans le worktree, créer `.env.local` (ignoré par git) :

```
VITE_BACKEND=pocketbase
VITE_PB_URL=http://127.0.0.1:8090
```

Puis `npm run dev`. Sans `.env.local`, l'app reste sur Base44. Retirer ces lignes (ou le fichier) pour revenir à Base44.

## Vérifications rapides

```powershell
curl.exe -s http://127.0.0.1:8090/api/health
curl.exe -s "http://127.0.0.1:8090/api/collections/BibleVerse/records?perPage=1&fields=id"   # public : totalItems = 50739
curl.exe -s "http://127.0.0.1:8090/api/collections/Message/records?perPage=1&fields=id"      # anonyme : totalItems = 0
```

Avec PocketBase, une règle de liste non satisfaite **filtre** les résultats (liste vide, HTTP 200) ; la lecture directe d'un enregistrement non autorisé renvoie 404.
