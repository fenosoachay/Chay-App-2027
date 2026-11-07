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
- `pocketbase/tests/fn-bloc3-collections.integration.mjs` : corrections de collections du bloc 3 (appareils, notifications, réactions, nom affiché, scores, listes d'identifiants).
- `pocketbase/tests/fn-auth.integration.mjs` : inscription par code, mot de passe oublié, changement d'e-mail, règles de `users`, invitation, suppression de compte, dernier administrateur (**faux SMTP requis**).
- `pocketbase/tests/*.local.test.js` (`vitest.pb-local.config.js`) : parcours de l'app avec le vrai adaptateur et le vrai SDK (Communauté, Requêtes, conversations, authentification de bout en bout avec le faux SMTP).
- `pocketbase/tests/fn-limites.integration.mjs` : limites de tentatives ; **toujours en dernier** (il épuise les compteurs pendant 60 s).

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
