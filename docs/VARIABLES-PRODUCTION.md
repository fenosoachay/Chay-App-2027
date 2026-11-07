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

Sans `PUSH_SIDECAR_*`, tout fonctionne sauf le push : notifications in-app et e-mails partent, le push est signalé `push_not_configured`.

### Réglages PocketBase (tableau de bord, pas des variables)
- **Mail settings** : hôte, port, utilisateur, **mot de passe** SMTP, adresse et nom d'expéditeur (`senderAddress`, `senderName`). Les mêmes réglages servent aux e-mails d'authentification et aux notifications.
- **Application URL** (`meta.appURL`) : adresse publique de l'**app** (liens des e-mails : `/messages`, `/requests`, `/settings`, `/media`).
- **Trusted proxy** : en-tête `X-Forwarded-For` (Caddy), sinon tous les membres partagent les compteurs de limites.

## Sidecar push (service `chay-push`)

| Variable | Exemple | Obligatoire | Rôle |
|---|---|---|---|
| `PUSH_SIDECAR_SECRET` | même valeur que PocketBase | oui (≥ 32 caractères, sinon arrêt) | **secret** partagé |
| `PUSH_PORT` | `8091` | non | port, écoute toujours 127.0.0.1 |
| `FIREBASE_SERVICE_ACCOUNT` | `/etc/chay/firebase-sa.json` | pour Android | chemin du JSON du compte de service (ou le JSON lui-même) ; **secret** |
| `VAPID_PUBLIC_KEY` | `BCWq_4_Qu_…` | pour le navigateur | **la clé publique déjà codée dans `src/lib/webPush.js`** |
| `VAPID_PRIVATE_KEY` | — | pour le navigateur | **secret** : la valeur du secret Base44 `VAPID_PRIVATE_KEY` (sinon les abonnements existants cessent de fonctionner) ; le sidecar vérifie qu'elle correspond à la clé publique |
| `VAPID_SUBJECT` | `mailto:contact@chay.fr` | conseillé | contact transmis aux services push |
| `FCM_API_BASE`, `PUSH_LOCAL_ONLY` | — | **jamais en production** | tests locaux seulement |

## Build de l'app (Vite)

| Variable | Valeur | Rôle |
|---|---|---|
| `VITE_BACKEND` | `pocketbase` | choisit l'adaptateur PocketBase (défaut : Base44) |
| `VITE_PB_URL` | `https://api.chay.fr` | adresse de PocketBase (valeur par défaut) |
| `VITE_PUBLIC_APP_URL` | `https://chay.fr` (**à confirmer**) | adresse publique du site de l'app : liens partagés depuis l'APK (verset, radio) |

Les variables `VITE_BASE44_*` ne servent plus qu'au mode Base44.

## Secrets Base44 à récupérer avant l'arrêt de Base44

| Secret Base44 | Devient |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | fichier `/etc/chay/firebase-sa.json` (ou nouveau compte de service du même projet Firebase) |
| `VAPID_PRIVATE_KEY` | `VAPID_PRIVATE_KEY` du sidecar |
| `INTERNAL_INVOKE_SECRET` | **supprimé** : plus d'appels internes par HTTP |
