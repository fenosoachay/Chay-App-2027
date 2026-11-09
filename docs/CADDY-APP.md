# Caddy : servir l'app web sur `https://membres.chay.fr`

Configuration **proposée, installée nulle part**. Le build web statique (`dist/`) est servi par le Caddy déjà présent devant PocketBase.

## Build et dépôt

```sh
# sur la machine de build
VITE_BACKEND=pocketbase VITE_PB_URL=https://api.chay.fr VITE_PUBLIC_APP_URL=https://membres.chay.fr VITE_VAPID_PUBLIC_KEY=<clé publique VAPID> npm run build
# copie sur le serveur (dossier en lecture seule pour Caddy)
rsync -a --delete dist/ chay@serveur:/srv/chay-app/dist/
```

Le DNS de `membres.chay.fr` doit pointer vers le serveur ; Caddy obtient le certificat tout seul.

## Bloc Caddyfile

```caddyfile
membres.chay.fr {
	root * /srv/chay-app/dist
	encode zstd gzip

	# Fichiers versionnés par Vite (nom avec empreinte) : cache d'un an.
	@hashed path /assets/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"

	# Logos, polices, données bibliques : une semaine.
	@static path /branding/* /fonts/* /data/*
	header @static Cache-Control "public, max-age=604800"

	# Point d'entrée, service worker et manifest : toujours revalidés,
	# sinon une nouvelle version de l'app n'arrive pas.
	@entry path / /index.html /sw.js /manifest.json
	header @entry Cache-Control "no-cache"

	# Application monopage : toute adresse inconnue renvoie index.html (/messages, /requests…).
	try_files {path} /index.html
	file_server

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Frame-Options "DENY"
		Permissions-Policy "geolocation=(self), camera=(), microphone=(), payment=(), usb=()"
		Cross-Origin-Opener-Policy "same-origin"
		-Server
		# CSP d'abord en observation (rien n'est bloqué, les écarts sont signalés dans la console) ;
		# passer à « Content-Security-Policy » après une semaine sans écart.
		Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://api.chay.fr https://media.chay.fr https://*.r2.cloudflarestorage.com https://listen.radioking.com https://api.open-meteo.com https://api.bigdatacloud.net https://raw.githubusercontent.com https://ramarozatofenosoa-chay.github.io https://fonts.googleapis.com https://fonts.gstatic.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://meet.jit.si https://www.facebook.com https://www.tiktok.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
	}

	log {
		output file /var/log/caddy/membres.chay.fr.log
		format json
	}
}
```

## Notes

- **`try_files`** : sans lui, recharger `/messages` donnerait une 404.
- **`no-cache` sur `sw.js`** : le service worker (push navigateur et hors ligne) doit être revérifié à chaque visite.
- **CSP** :
  - `script-src 'unsafe-inline'` est là pour le petit script anti-flash du thème dans `index.html`. On pourra le remplacer par son empreinte `sha256-…` une fois le build figé.
  - `img-src https:` reste large, car les vignettes et anciennes images peuvent venir de plusieurs domaines (YouTube, R2, PocketBase).
  - `*.r2.cloudflarestorage.com` sert à l'envoi direct des vidéos (URL présignées).
- **Journaux** : le journal d'accès contient les adresses IP ; à conserver le moins longtemps possible (rotation Caddy).
- **PocketBase** (`api.chay.fr`) garde son propre bloc (`reverse_proxy 127.0.0.1:8090`, voir plus bas) ; régler « Trusted proxy » dans PocketBase. Le sidecar push (`127.0.0.1:8091`) n'apparaît **dans aucun bloc**.
- **CORS côté PocketBase** : `--origins=https://membres.chay.fr,https://localhost` (APK Android).

## Bloc `api.chay.fr` : administration de PocketBase fermée depuis Internet

Le tableau d'administration et les routes réservées au superuser répondent **404** depuis Internet. Ils restent accessibles **par le tunnel SSH** (`ssh -N -L 8092:127.0.0.1:8090 …`), qui parle directement à PocketBase sur `127.0.0.1:8090`, sans passer par Caddy.

Ces routes exigent déjà un superuser dans PocketBase. Le blocage ajoute une protection : pas de page de connexion exposée, pas d'essais de mots de passe superuser depuis Internet.

Les règles sont dans un fichier à part, `/etc/caddy/chay-pb-admin.caddy`, inclus par une seule ligne dans le bloc `api.chay.fr` :

```caddyfile
api.chay.fr {
	import /etc/caddy/chay-pb-admin.caddy
	reverse_proxy 127.0.0.1:8090
}
```

Contenu de `/etc/caddy/chay-pb-admin.caddy` :

```caddyfile
# Administration PocketBase : jamais depuis Internet (tunnel SSH vers 127.0.0.1:8090 seulement).
@pb_admin path /_ /_/* /api/settings /api/settings/* /api/backups /api/backups/* /api/crons /api/crons/* /api/logs /api/logs/* /api/collections /api/collections/ /api/collections/_*
respond @pb_admin 404
# Schéma d'une collection, import des collections (superuser seulement) : /api/collections/<nom>, /api/collections/import
@pb_schema path_regexp pb_schema ^/api/collections/[^/]+/?$
respond @pb_schema 404
# Vidage d'une collection (superuser seulement)
@pb_truncate path_regexp pb_truncate ^/api/collections/[^/]+/truncate$
respond @pb_truncate 404
```

| Bloqué (404 depuis Internet) | Pourquoi c'est sans risque |
|---|---|
| `/_`, `/_/*` | tableau d'administration : par le tunnel seulement |
| `/api/collections/_*` | `_superusers` (connexion superuser) et autres collections système (`_mfas`, `_otps`…) ; aucune collection de l'app ne commence par `_` |
| `/api/settings`, `/api/backups`, `/api/crons`, `/api/logs` (et sous-chemins) | réglages, sauvegardes, tâches, journaux : superuser seulement |
| `/api/collections`, `/api/collections/<nom>`, `/api/collections/import`, `/api/collections/<nom>/truncate` | liste et schéma des collections : superuser seulement, jamais appelés par l'app |

| **Jamais** bloqué | Utilisé par |
|---|---|
| `/api/collections/<nom>/records…` | lecture et écriture des données (SDK) |
| `/api/collections/users/auth-…`, `request-otp`, `request-password-reset`, `confirm-…` | connexion et compte des membres |
| `/api/realtime` | messages en direct |
| `/api/files/*` | images, audio, PDF |
| `/api/fn/*` | fonctions de l'app (hooks) |
| `/api/health` | supervision |

Vérifié dans le code (9 novembre 2026) :
- `src/`, y compris l'adaptateur PocketBase : seulement le SDK (`collection(…).…` → `/records` ou `/auth-…`, `realtime`, `files`) et `/api/fn/*` ;
- l'APK (code Java de `android/`) : aucun appel à l'API ;
- `pb_hooks/` : accès internes (`$app`), aucun appel HTTP vers PocketBase ;
- sidecar push : n'appelle que FCM et les services Web Push ;
- seuls les scripts d'administration (`configurer-production.mjs`, `configurer-auth.mjs`, `importer-baiboly.mjs`, `migrer-fichiers.mjs`) utilisent `_superusers` et `/api/settings`, toujours **par le tunnel** (`127.0.0.1`), donc sans passer par Caddy.
