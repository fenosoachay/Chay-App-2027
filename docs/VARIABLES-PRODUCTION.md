# Variables d'environnement de production

Aucune de ces valeurs ne va dans le dépôt. Fichiers sur le serveur, droits `600`, propriétaire `root` :
- `/etc/chay/pocketbase.env` pour le service PocketBase ;
- `/etc/chay/push.env` pour le sidecar push.

## PocketBase (service `pocketbase`)

| Variable | Exemple | Obligatoire | Rôle |
|---|---|---|---|
| `R2_ENDPOINT` | `https://<compte>.r2.cloudflarestorage.com` | pour les vidéos > 100 Mo | point d'accès S3 de R2 |
| `R2_BUCKET` | `chay-videos` | idem | bucket des vidéos |
| `R2_ACCESS_KEY_ID` | — | idem | jeton API R2 limité au bucket |
| `R2_SECRET_ACCESS_KEY` | — | idem | **secret** |
| `R2_REGION` | `auto` | non (défaut `auto`) | région SigV4 |
| `R2_PUBLIC_BASE_URL` | `https://media.chay.fr` | idem | domaine public du bucket (adresses de lecture) |
| `R2_PREFIX` | `videos` | non | préfixe des clés |
| `CHAY_PUBLIC_URL` | `https://api.chay.fr` | conseillé | adresse publique de PocketBase pour les adresses de fichiers (sinon : hôte de la requête) |
| `PUSH_SIDECAR_URL` | `http://127.0.0.1:8091` | pour le push | adresse locale du sidecar |
| `PUSH_SIDECAR_SECRET` | 32 octets aléatoires, base64url | pour le push | **secret** partagé avec le sidecar |
| `PB_ENCRYPTION_KEY` | 32 caractères aléatoires | recommandé | à passer par `--encryptionEnv=PB_ENCRYPTION_KEY` : chiffre en base les réglages (dont le mot de passe SMTP) |

| `NOTIFICATIONS_MODE` | `test` au départ, `on` au basculement | **oui** (défaut `off`) | interrupteur des envois sortants des hooks, voir ci-dessous |
| `NOTIFICATIONS_TEST_EMAILS` | `test-admin@…,test-membre@…` | en mode `test` | adresses autorisées en mode `test`, séparées par des virgules (casse ignorée) |
| `FICHIERS_NETTOYAGE` | `simulation` | non (défaut `simulation`, aussi si invalide) | tâche hebdomadaire `fichiers_orphelins` (dimanche 03:30) : `simulation` = journalise seulement le nombre de fichiers non référencés depuis plus de 7 jours ; `actif` = les supprime vraiment |

### Interrupteur `NOTIFICATIONS_MODE`

| Valeur | Effet |
|---|---|
| `off` (**défaut**, aussi si absente ou invalide) | aucun push (FCM, Web Push) ni e-mail de notification ne sort ; file `PushEnvoi` vidée sans envoi ; la tâche `verset_du_jour` s'arrête **avant** de parcourir les membres. Seul un compteur est journalisé (`[sortie] envois bloques`), sans adresse ni identifiant |
| `test` | envoi **uniquement** aux comptes dont l'e-mail est dans `NOTIFICATIONS_TEST_EMAILS` ; les autres sont ignorés (comptés dans le journal) ; le verset du jour ne parcourt que ces comptes |
| `on` | comportement normal |

Couvert : push Android et navigateur (toutes les routes, prière, messages, communauté, réactions, thèmes, nouveautés, verset du jour, tests), file `PushEnvoi` et ses réessais, e-mails envoyés par les hooks (messages, thèmes, nouveautés, e-mail de test). **Non couvert** : les e-mails d'authentification de PocketBase (code de connexion, réinitialisation, vérification, changement d'e-mail), toujours déclenchés par l'action d'un membre. Les notifications in-app (`UserNotification`) restent créées : elles ne quittent pas le serveur (sauf le verset du jour, limité comme ci-dessus).

Le sidecar lit aussi `NOTIFICATIONS_MODE` (même valeur, dans `/etc/chay/push.env`) : en `off`, il refuse tout envoi (double verrou). Le filtrage par adresse du mode `test` est fait par les hooks.

Sans `PUSH_SIDECAR_*`, tout fonctionne sauf le push : notifications in-app et e-mails partent, le push est signalé `push_not_configured`.

### Réglages PocketBase (pas des variables ; appliqués par `pocketbase/scripts/configurer-production.mjs`, voir `docs/DEPLOIEMENT.md` étape 3c)
- **Mail settings** : hôte, port, utilisateur, **mot de passe** SMTP, adresse et nom d'expéditeur (`senderAddress`, `senderName`). Les mêmes réglages servent aux e-mails d'authentification et aux notifications.
- **Application URL** (`meta.appURL`) : **`https://membres.chay.fr`**, adresse publique de l'**app** (liens des e-mails : `/messages`, `/requests`, `/settings`, `/media`, réinitialisation du mot de passe).

### Les trois adresses publiques

| Adresse | Sert | Où la régler |
|---|---|---|
| `https://membres.chay.fr` | le site web de l'app (build Vite statique, servi par Caddy : `docs/CADDY-APP.md`) | `VITE_PUBLIC_APP_URL` (build) et « Application URL » de PocketBase (e-mails) |
| `https://api.chay.fr` | PocketBase (API, fichiers) | `VITE_PB_URL` (build) et `CHAY_PUBLIC_URL` (adresses des fichiers) : **ce n'est pas l'adresse de l'app** |
| `https://media.chay.fr` | vidéos R2 | `R2_PUBLIC_BASE_URL` |
- **Trusted proxy** : en-tête `X-Forwarded-For`, `useLeftmostIP` désactivé (Caddy sur le même hôte, PocketBase sur 127.0.0.1 seulement), sinon tous les membres partagent les compteurs de limites.
- **Mot de passe SMTP** : variable `SMTP_PASSWORD` **sur le PC**, seulement le temps de lancer `configurer-production.mjs` ; PocketBase le garde ensuite dans ses réglages (chiffrés avec `PB_ENCRYPTION_KEY`).

## Sidecar push (service `chay-push`)

| Variable | Exemple | Obligatoire | Rôle |
|---|---|---|---|
| `PUSH_SIDECAR_SECRET` | même valeur que PocketBase | oui (≥ 32 caractères, sinon arrêt) | **secret** partagé |
| `PUSH_PORT` | `8091` | non | port, écoute toujours 127.0.0.1 |
| `FIREBASE_SERVICE_ACCOUNT` | `/etc/chay/firebase-sa.json` | pour Android | chemin du JSON du compte de service (ou le JSON lui-même) ; **secret** |
| `VAPID_PUBLIC_KEY` | clé affichée par `generer-vapid.mjs` | pour le navigateur | **nouvelle** clé publique, identique à `VITE_VAPID_PUBLIC_KEY` du build |
| `VAPID_PRIVATE_KEY` | — | pour le navigateur | **secret** : la valeur écrite par `generer-vapid.mjs` dans `C:Secrets-Chayapid.txt` ; le sidecar vérifie qu'elle correspond à la clé publique |
| `VAPID_SUBJECT` | `mailto:no-reply@chay.fr` | non (c'est le défaut) | contact transmis aux services push |
| `NOTIFICATIONS_MODE` | même valeur que PocketBase | **oui** (défaut `off` : rien ne part) | `off` refuse tout envoi ; `test` / `on` envoient (le filtrage du mode `test` est fait par les hooks) |
| `FCM_API_BASE`, `PUSH_LOCAL_ONLY` | — | **jamais en production** | tests locaux seulement |

## Build de l'app (Vite)

| Variable | Valeur | Rôle |
|---|---|---|
| `VITE_BACKEND` | `pocketbase` | choisit l'adaptateur PocketBase (défaut : Base44) |
| `VITE_PB_URL` | `https://api.chay.fr` | adresse de PocketBase (valeur par défaut) |
| `VITE_VAPID_PUBLIC_KEY` | clé publique de `generer-vapid.mjs` | clé publique VAPID du push navigateur ; **même valeur** que `VAPID_PUBLIC_KEY` du sidecar (sinon les envois sont refusés et les abonnements supprimés). Absente : push navigateur indisponible |
| `VITE_PUBLIC_APP_URL` | `https://membres.chay.fr` (valeur par défaut) | adresse publique du site de l'app : liens partagés depuis l'APK (verset, radio), image de la notification radio |

Les variables `VITE_BASE44_*` ne servent plus qu'au mode Base44.

## Secrets Base44 à récupérer avant l'arrêt de Base44

| Secret Base44 | Devient |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | fichier `/etc/chay/firebase-sa.json` (ou nouveau compte de service du même projet Firebase) |
| `VAPID_PRIVATE_KEY` | **abandonné** (irrécupérable) : nouvelle paire générée par `pocketbase/scripts/generer-vapid.mjs` ; les abonnements navigateur existants sont remplacés automatiquement (voir `docs/PUSH.md`) |
| `INTERNAL_INVOKE_SECRET` | **supprimé** : plus d'appels internes par HTTP |
