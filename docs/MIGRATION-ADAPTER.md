# Couche d'adaptation Base44 → PocketBase (bloc 1)

Objectif : faire tourner l'app sur PocketBase (`https://api.chay.fr`) **sans modifier les ~100 fichiers** qui importent `base44` depuis `@/api/base44Client`. La couche expose la même interface que le client Base44 et traduit les appels vers le SDK `pocketbase`.

## Activation

| Variable | Valeurs | Effet |
|---|---|---|
| `VITE_BACKEND` | absente ou `base44` (défaut) | client Base44 d'origine, **créé exactement comme avant** |
| | `pocketbase` | couche d'adaptation PocketBase |
| `VITE_PB_URL` | URL (défaut `https://api.chay.fr`) | serveur PocketBase visé |

La valeur est figée au build (variables Vite). Une valeur inconnue affiche un avertissement et garde Base44.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/api/base44Client.js` | seul changement côté app : `base44 = IS_POCKETBASE ? createPocketBaseBackend() : createClient(...)` |
| `src/lib/app-params.js` | en mode PocketBase seulement, `token` = jeton du authStore PocketBase (AuthContext décide « connecté / invité » avec ce jeton). Le stockage Base44 n'est ni lu ni modifié. |
| `src/api/backendConfig.js` | lecture de `VITE_BACKEND` / `VITE_PB_URL`, clé de stockage `pocketbase_auth` |
| `src/api/backend.js` | crée l'instance PocketBase (authStore `LocalAuthStore("pocketbase_auth")`, annulation automatique désactivée) |
| `src/api/pocketbase/adapter.js` | l'interface Base44 (`entities`, `auth`, `functions`, `integrations`, `users`, `app`, `config`) |
| `src/api/pocketbase/translate.js` | traductions pures (filtres, tris, pagination, enregistrements) |
| `src/api/pocketbase/schemaHints.js` | champs « date seule » et champs tableau, issus de `base44/entities/*.jsonc` (à régénérer si le schéma change) |
| `src/api/pocketbase/*.test.js`, `vitest.config.js` | tests unitaires (`npm run test:adapter`), réseau interdit |

## Interface couverte

### `entities.<Entité>`

| Méthode | Traduction PocketBase |
|---|---|
| `list(sort, limit, skip, fields)` / `filter(query, sort, limit, skip, fields)` | `getList(page, perPage, { filter, sort, fields, skipTotal })` ; plusieurs pages si `limit > 1000` ou `skip` non multiple de `limit` ; renvoie un tableau |
| `list(options)` / `filter(query, options)` | une page ; `cursor` = numéro de page ; renvoie `{ items, has_more, next_cursor }` |
| `get(id)` | `getOne(id)` |
| `count(query)` | `getList(1, 1).totalItems` |
| `create(data)` | `create` ; ajoute `created_by_id` = utilisateur connecté (s'il n'est pas fourni). Les dates `base44_*` sont posées par le hook serveur (`pocketbase/pb_hooks/base44_compat.pb.js`), jamais envoyées par le client. **Conversation** : route `POST /api/fn/createConversation` (création directe interdite par la règle). |
| `update(id, data)` | `update` (dates posées par le hook). **Conversation** : un changement de `participant_ids` part vers `POST /api/fn/updateConversationParticipants`, les autres champs restent en mise à jour directe. |
| `delete(id)` | `delete` |
| `bulkCreate(rows)` / `bulkUpdate([{ id, ... }])` | créations / mises à jour individuelles, 4 en parallèle |
| `updateMany(query, { $set })` | recherche des id puis mises à jour individuelles (seul `$set`) |
| `deleteMany(query)` | recherche des id puis suppressions ; **requête vide refusée** |
| `subscribe(cb)` | `subscribe('*')` ; évènement `{ type, id, data, timestamp }` comme Base44 ; renvoie une fonction de désabonnement synchrone |
| `aggregate`, `upsert`, `importEntities`, `schema` | erreur « pas encore migré » |

`entities.User` → collection `users`. Les objets renvoyés ont la forme Base44 : `id`, `created_by_id` inchangés ; `created_date` / `updated_date` (depuis `base44_*`, sinon `created` / `updated`) ; `created_by` si connu ; `full_name` = `name` pour User. Les champs propres à PocketBase (`collectionId`, `collectionName`, `expand`, `created`, `updated`, `base44_*`) sont retirés.

### `auth`

| Méthode | Comportement |
|---|---|
| `me()` | `users.authRefresh()` ; sans jeton ou jeton refusé : erreur `status 403`, `data.extra_data.reason = "auth_required"` (déjà gérée par AuthContext → mode invité) |
| `isAuthenticated()` | `me()` réussi ou non |
| `loginViaEmailPassword(email, mdp)` | `authWithPassword` ; renvoie `{ access_token, user }` |
| `setToken(token)` | enregistre le jeton dans le authStore PocketBase (sans effet si identique) |
| `updateMe(data)` | `users.update(soi, data)` (`full_name` → `name`) |
| `logout(url?)` | vide le authStore puis recharge `url` ou la page courante |
| `redirectToLogin(url?)` | `/login?from_url=…` (page de connexion de l'app) |
| `hasToken()` | jeton présent |
| `register`, `verifyOtp`, `resendOtp`, `resetPasswordRequest`, `resetPassword`, `loginWithProvider`, … | **erreur « pas encore migré »** |

### Autres

| Élément | Comportement |
|---|---|
| `functions.invoke(nom, données)` | `POST {VITE_PB_URL}/api/fn/<nom>` (JSON, en-tête `Authorization` = jeton) ; renvoie `{ data, status, headers }` comme Base44. Route absente (404) : erreur `function_not_migrated` explicite. Nom limité à `[A-Za-z0-9_]`. Envoi de fichiers : « pas encore migré ». |
| `integrations.*.*` (UploadFile…) | erreur « pas encore migré » |
| `users.*` (inviteUser) | erreur « pas encore migré » |
| `app.getPublicSettings()` | réglages neutres, sans requête (appelé par AuthContext au démarrage) |
| `config.token` | jeton PocketBase courant (lu par `src/lib/upload.js`) |

## Traductions

| Base44 | PocketBase |
|---|---|
| `{ a: "x", b: 2 }` | `a = "x" && b = 2` |
| `{ a: null }` | `a = null` |
| `{ a: { $ne: v } }` | `a != v` |
| `{ a: { $in: [x, y] } }` / `$nin` | `(a = x \|\| a = y)` / `(a != x && a != y)` ; liste vide : toujours faux / toujours vrai |
| `$gt`, `$gte`, `$lt`, `$lte` | `>`, `>=`, `<`, `<=` |
| `{ a: { $regex: "txt", $options: "i" } }`, `/txt/i` | `a ~ "%txt%"` ; `^txt` → `"txt%"`, `txt$` → `"%txt"` |
| `$or: [...]`, `$and: [...]` | `(...) \|\| (...)`, `(...) && (...)` |
| `"data.champ"` | `champ` |
| champ tableau (`participant_ids`, `read_by`, …) : `{ participant_ids: id }` | « contient » : `participant_ids ~ "\"id\""` (`$ne` → `!~`) |
| `created_date` / `updated_date` / `created_by` | `base44_created_date` / `base44_updated_date` / `base44_created_by` |
| `full_name` (User) | `name` |
| tri `-created_date` | `-base44_created_date,-created` (repli sur la date PocketBase) |
| `skip` / `limit` | `page` / `perPage` (limite par défaut 100, comme le SDK Base44) |
| date seule `"2026-11-06"` (champs `format: date`) | `"2026-11-06 00:00:00.000Z"` (et l'inverse en lecture) |
| date ISO `"2026-11-06T10:00:00Z"` dans un filtre | `"2026-11-06 10:00:00.000Z"` |

**Sécurité des filtres** : les valeurs sont échappées comme le fait `pb.filter()` du SDK (`JSON.stringify`) ; les noms de champs sont limités aux identifiants simples `[A-Za-z_][A-Za-z0-9_]*`. Une requête intraduisible lève une `TranslationError` **avant** tout appel réseau : jamais de filtre approximatif silencieux. `pb.filter()` n'est pas utilisé car il dépend de `RegExp.escape`, absent des WebView Android anciennes.

## Limites connues

- **Non migré** (erreur explicite) : inscription, codes OTP, mot de passe oublié, OAuth Google / SSO, MFA (appels directs `/api/apps/...` dans `authMfa*.js`), téléversement de fichiers, `users.inviteUser`, `aggregate`, `upsert`, `importEntities`, `list({ distinct })`, toutes les fonctions serveur (aucune route `/api/fn/*` n'existe encore).
- **Opérateurs non pris en charge** : `$exists`, `$nor`, `$all`, `$elemMatch`, `$inc`/`$push`… dans `updateMany`, égalité sur un objet ou un tableau entier, champs imbriqués `a.b`.
- **`$regex`** : seulement les motifs sans métacaractère (hors `^` et `$`). Toujours insensible à la casse (LIKE), même sans l'option `i`. `%` et `_` dans le texte cherché agissent comme jokers. `^txt$` devient « contient ».
- **Champs tableau** : « contient » est une recherche dans le texte json ; fiable pour les id (24 hex) et les valeurs simples.
- **Opérations en masse** : une requête par enregistrement (pas d'atomicité, pas d'API batch) ; `updateMany` / `deleteMany` lisent d'abord tous les id correspondants.
- **Comptes** : `count` et `list(options)` demandent le total à PocketBase (plus coûteux que `skipTotal`).
- **Dates vides** : PocketBase renvoie `""`, converti en `null`.
- **Taille du bundle** : le SDK `pocketbase` est importé statiquement, donc présent dans le bundle même en mode Base44 (sans être exécuté).
- **Règles d'accès** : l'adaptateur n'ajoute aucune vérification ; ce sont les règles PocketBase qui s'appliquent (voir `C:\Export-Base44\_outil\pb\regles.md`). `created_by_id` est fixé à l'utilisateur connecté à la création, comme l'exigent ces règles.

## Tester

```bash
npm run test:adapter     # 59 tests, aucun appel réseau (fetch bloqué)
```

Lancer l'app en local sur PocketBase, de préférence sur un serveur **local** (pas la production) :

```bash
# .env.local (non suivi par git)
VITE_BACKEND=pocketbase
VITE_PB_URL=http://127.0.0.1:8090

npm run dev
```

Avec `VITE_PB_URL=https://api.chay.fr`, l'app lirait et écrirait les **données de production**, et le serveur doit autoriser l'origine `http://localhost:5173` (CORS).
