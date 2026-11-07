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

## Jetons invalides

| Réponse | Action |
|---|---|
| FCM `UNREGISTERED` (404) | `DeviceToken` **supprimé** |
| Web Push 404 ou 410 | `WebPushSubscription` **supprimé** |
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
| `createCommunityPost` (membre non admin) | notification à toute la communauté pour 3 publications par heure au plus ; au-delà, la publication est créée sans notification (`notification_error: "rate_limited"`) |
| `createThemeRequest` | 10 demandes par 24 h et par membre (429) |
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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | sidecar | **même paire que Base44** (la clé publique est codée dans `src/lib/webPush.js` : sinon les abonnements navigateur existants ne marchent plus) |
| `VAPID_SUBJECT` | sidecar | `mailto:` ou `https://` de contact |
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
