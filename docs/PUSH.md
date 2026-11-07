# Notifications push et e-mails (bloc 5)

## Architecture

```
app ──► PocketBase (hooks /api/fn/*) ──$http──► sidecar push (Node, 127.0.0.1:8091) ──► FCM HTTP v1
             │                                                                    └──► services Web Push
             └── e-mails : client SMTP de PocketBase (réglages « Mail settings »)
```

- **PocketBase décide** : qui reçoit quoi, préférences, limites, notifications in-app (`UserNotification`), e-mails.
- **Le sidecar ne fait que livrer** : il reçoit une liste de cibles déjà filtrées (jeton FCM ou abonnement Web Push) et un message, signe et envoie, puis renvoie un résultat par cible. Il ne lit pas la base.
- **E-mails** : envoyés par PocketBase avec le SMTP déjà configuré pour l'authentification (bloc 3) ; pas de deuxième configuration SMTP.

## Sidecar `pocketbase/sidecar-push/serveur.mjs`

- Node ≥ 20, **aucune dépendance npm** : `node:crypto` (RS256, ES256, ECDH, HKDF, AES-128-GCM).
- Service systemd `chay-push` (modèle : `pocketbase/sidecar-push/chay-push.service`), utilisateur sans droits, `ProtectSystem=strict`.
- Écoute **127.0.0.1 uniquement** ; jamais déclaré dans Caddy.
- Chaque requête doit porter l'en-tête `X-Chay-Push-Secret` (secret partagé, comparaison à temps constant) ; sinon 401.
- `POST /envoyer` : `{ notification: { title, body, target_type, target_id }, ttl, fcm: [{ ref, token }], web: [{ ref, endpoint, p256dh, auth }] }`, 500 cibles maximum par appel. Réponse : `{ fcm: [{ ref, ok, invalid, retry, classification }], web: [...], fcmError, webSkipped }`.
- `GET /etat` : configuration présente ou non (FCM, VAPID), jamais les valeurs.

### FCM HTTP v1
- Jeton OAuth : JWT RS256 signé avec la clé du compte de service (`iss`, `scope firebase.messaging`, `aud` = `token_uri`), échangé contre un jeton d'accès, **gardé en mémoire 50 min**.
- Message identique à Base44 : `notification { title, body }`, `android.notification.channel_id = "chay-default"`, `data { target_type, target_id }`.

### Web Push
- VAPID (RFC 8292) : JWT ES256 (`aud` = origine du service, `exp` 12 h, `sub` = `VAPID_SUBJECT`), en-tête `Authorization: vapid t=…, k=…`.
- Chiffrement `aes128gcm` (RFC 8291) ; vérifié par le vecteur de test officiel de la RFC.
- Au démarrage, le sidecar vérifie que `VAPID_PUBLIC_KEY` correspond bien à `VAPID_PRIVATE_KEY`.
- Sujet VAPID : `VAPID_SUBJECT`, par défaut `mailto:no-reply@chay.fr`.

### Nouvelle paire VAPID (l'ancienne clé de Base44 est abandonnée)
- La clé privée VAPID de Base44 est **irrécupérable** : une **nouvelle paire** est générée par `node pocketbase/scripts/generer-vapid.mjs C:Secrets-Chayapid.txt` (n'affiche que la clé publique ; la privée va seulement dans le fichier, créé sans écrasement et à accès restreint). `pocketbase/scripts/verifier-vapid.mjs` contrôle ensuite qu'un fichier de clé privée correspond à la clé publique de l'app.
- La **même** clé publique va dans `VITE_VAPID_PUBLIC_KEY` (build de l'app) et `VAPID_PUBLIC_KEY` (sidecar) ; la privée dans `VAPID_PRIVATE_KEY` (sidecar seulement).
- Mode base44 inchangé : il garde l'ancienne clé codée dans `src/lib/webPushCore.js`. En mode PocketBase sans `VITE_VAPID_PUBLIC_KEY`, le push navigateur est indisponible (le push Android FCM n'est pas concerné).
- Les hooks PocketBase **ne lisent pas** les clés VAPID : seul le sidecar signe les envois (la clé privée reste dans un seul service).

### Ré-abonnement automatique
- Les abonnements navigateur importés de Base44 ont été créés avec l'ancienne clé : le service push les refuse (403).
- **Côté serveur** : un refus 403, 404 ou 410 supprime le `WebPushSubscription` (la paire du sidecar étant vérifiée au démarrage, un 403 vient de l'abonnement, pas du serveur).
- **Côté app** (mode PocketBase, `src/lib/webPushCore.js`) : à chaque ouverture (permission déjà accordée) ou activation, si l'abonnement du navigateur a été créé avec une autre clé (`options.applicationServerKey` différente), l'app le désabonne, en crée un nouveau avec la nouvelle clé et **remplace** l'ancienne ligne `WebPushSubscription` (mise à jour avec le nouvel endpoint et les nouvelles clés, pas de doublon). Rien à faire pour les membres : ils doivent seulement rouvrir l'app (sans nouvelle demande de permission). Navigateur qui n'expose pas la clé : abonnement gardé ; s'il est refusé, le serveur le supprime et l'app en recrée un à l'ouverture suivante.

## Interrupteur `NOTIFICATIONS_MODE`

`off` (défaut) / `test` / `on`, lu par les hooks **et** le sidecar. Vérifié en un seul point pour le push (`deliverTargets` dans `lib/push.js`, file `PushEnvoi` comprise) et pour les e-mails (`send` dans `lib/courriel.js`) ; logique dans `lib/sortie.js`. Détails : `docs/VARIABLES-PRODUCTION.md`.

## Jetons invalides

| Réponse | Action |
|---|---|
| FCM `UNREGISTERED` (404) | `DeviceToken` **supprimé** |
| Web Push 404 ou 410 | `WebPushSubscription` **supprimé** |
| Web Push 403 (abonnement créé avec une autre clé VAPID, ex. celle de Base44) | `WebPushSubscription` **supprimé** ; l'app se réabonne à l'ouverture suivante |
| FCM `INVALID_ARGUMENT`, autres 4xx | rien (comme Base44 : peut venir du message, pas du jeton) |

Base44 passait ces enregistrements à `is_active = false` ; ici on les supprime (demande du bloc 5). Seuls les enregistrements dont `created_by_id = user_id` sont utilisés (comme Base44).

## File d'attente et réessais

- Envoi immédiat pendant la requête (comme Base44) : délai maximal 20 s côté PocketBase.
- Dans le sidecar : concurrence 20 (FCM) et 10 (Web Push) ; une seconde tentative après 1 s sur 429, 500, 502, 503, 504 ou erreur réseau (en respectant `Retry-After`, jusqu'à 5 s).
- Si l'échec reste temporaire, ou si le sidecar est injoignable, la cible est mise dans la collection **`PushEnvoi`** (règles fermées, superuser seulement).
- La tâche planifiée `push_reessais` (chaque minute) reprend les envois dus : 5 tentatives au maximum, attente de 1, 2, 5 puis 15 min, abandon après 6 h (durée de vie du message, comme le TTL Web Push de Base44). Les lignes terminées sont supprimées.

## Limites

| Cas | Limite |
|---|---|
| Sidecar | 500 cibles par appel ; PocketBase découpe |
| `sendFcmPush` en mode test (membre, vers lui-même) | 5 par 10 min |
| `notifySocialInteraction` | un push « j'aime » par (membre, publication) et par 24 h ; 30 push de commentaire par heure et par membre |
| `createCommunityPost` (membre non admin) | notification à toute la communauté pour 3 publications par heure au plus ; au-delà, la publication est créée sans notification (`notification_error: null`, `notification_info: "rate_limited"` : limite voulue, pas un échec) |
| `createThemeRequest` | 10 demandes par 24 h et par membre (429) |

**`createMessage`** renvoie deux champs :
- `notification_error` : seulement les **vrais échecs** (`notification_dispatch_failed`, `notification_creation_failed`, `push_delivery_failed`, `push_not_configured`…). L'app affiche alors « La notification du destinataire n'a pas pu être envoyée ».
- `notification_info` : un cas **normal**, sans message d'erreur. Il vaut `notifications_off` ou `notifications_test` (push retenu par `NOTIFICATIONS_MODE`), ou `no_push_subscription` (destinataire sans appareil abonné). La notification in-app est créée dans tous ces cas.

C'est une différence voulue avec Base44, qui renvoyait aussi ces deux cas dans `notification_error`.
| Longueurs | titre 100 caractères, texte push 100 (FCM) / 300 (Web Push), extraits comme Base44 |

Les compteurs en mémoire (`$app.store()`) repartent de zéro au redémarrage de PocketBase ; les autres sont calculés depuis la base.

## Journaux

Rien de personnel : ni jeton, ni adresse d'abonnement, ni identifiant de membre, ni e-mail, ni texte du message.
Seulement : nom de la fonction, nombres (cibles, réussis, échecs, supprimés, remis en file) et classification (`accepted`, `unregistered_token`, `http_503`, `transport_error`…).

## Sécurité

- L'appelant est toujours `e.auth` ; les anciens `internal_secret` disparaissent (les appels internes sont des appels de fonctions JS dans PocketBase, pas des requêtes HTTP).
- Un membre ne peut jamais choisir un destinataire :
  - message → participants de la conversation ;
  - « j'aime » ou commentaire → auteur de la publication, après vérification que le « j'aime » ou le commentaire existe ;
  - prière → demandeur ou intercesseur ;
  - thème → admins désignés, puis demandeur ;
  - test → lui-même.
- `sendFcmPush` / `sendWebPush` avec `user_ids`, `notifyNewContent`, `notifyDailyVerse`, `sendTestNotification`, `sendMessagePush` : admins seulement.
- E-mails : tout texte venant d'un membre est échappé (HTML) ; sujets sans retour à la ligne ni caractère de contrôle.

## Variables d'environnement

Voir `docs/VARIABLES-PRODUCTION.md`.

| Variable | Où | Rôle |
|---|---|---|
| `PUSH_SIDECAR_URL` | PocketBase | `http://127.0.0.1:8091` |
| `PUSH_SIDECAR_SECRET` | PocketBase et sidecar | secret partagé (32 octets aléatoires) |
| `FIREBASE_SERVICE_ACCOUNT` | sidecar | JSON du compte de service, ou chemin d'un fichier qui le contient |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | sidecar | **nouvelle paire** (`generer-vapid.mjs`) ; la clé publique est aussi `VITE_VAPID_PUBLIC_KEY` au build de l'app. L'ancienne paire de Base44 est abandonnée |
| `VITE_VAPID_PUBLIC_KEY` | build de l'app | même valeur que `VAPID_PUBLIC_KEY` |
| `VAPID_SUBJECT` | sidecar | `mailto:no-reply@chay.fr` (défaut) |
| `PUSH_PORT` | sidecar | 8091 par défaut |
| (SMTP) | réglages PocketBase | pas de variable : hôte, port, utilisateur et mot de passe SMTP sont dans les réglages « Mail settings » de PocketBase (chiffrés en base avec `--encryptionEnv`) ; les e-mails d'authentification et de notification les partagent |
| `FCM_API_BASE`, `PUSH_LOCAL_ONLY` | sidecar, **tests seulement** | adresse du faux FCM ; refus de toute adresse hors 127.0.0.1 |

## Verset du jour

Tâche planifiée `verset_du_jour` à 05:00 et 06:00 UTC ; elle ne travaille que s'il est entre 06:55 et 07:59 à Paris (heure d'été ou d'hiver), comme le « 07:00 Europe/Paris » de Base44. Le jour de la semaine de chaque membre est calculé dans son fuseau (`settings.tz`) ; le moteur JS de PocketBase n'ayant pas `Intl`, les règles de fuseau sont dans `lib/fuseaux.js` (Europe, Amérique du Nord, fuseaux fixes ; inconnu → Paris, comme Base44).

## Différences avec Base44

| Point | Base44 | PocketBase |
|---|---|---|
| Jeton / abonnement périmé | `is_active = false` | supprimé |
| Push de `takePrayer`, `answerPrayer`, `createThemeRequest`, `handleThemeRequest` | appel sans `internal_secret` : refusé par `sendFcmPush` (push jamais parti) | envoyé, en respectant la coupure générale et le canal push du membre |
| Appels internes | HTTP + `INTERNAL_INVOKE_SECRET` | appels JS dans PocketBase ; secret supprimé |
| Échec temporaire | perdu (createMessage réessayait 3 fois tout l'envoi) | file `PushEnvoi`, 5 tentatives sur 6 h |
| Comptes désactivés (`disabled`) | notifiés | jamais notifiés |
| Limites | aucune | voir « Limites » (test push, j'aime, rafale de publications, demandes de thème) |
| `createCommunityPost` | toute URL d'image | http(s), 10 images au plus |
| Verset du jour | `Intl` (tous les fuseaux) | table de fuseaux (`lib/fuseaux.js`) ; fuseau inconnu -> Paris |
| E-mails | `Core.SendEmail` de Base44 | SMTP de PocketBase ; liens vers « Application URL » au lieu de `chay.base44.app` |
