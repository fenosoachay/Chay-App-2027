# Caddy : servir l'app web sur `https://app.chay.fr`

Configuration **proposée, installée nulle part**. Le build web statique (`dist/`) est servi par le Caddy déjà présent devant PocketBase.

## Build et dépôt

```sh
# sur la machine de build
VITE_BACKEND=pocketbase VITE_PB_URL=https://api.chay.fr VITE_PUBLIC_APP_URL=https://app.chay.fr npm run build
# copie sur le serveur (dossier en lecture seule pour Caddy)
rsync -a --delete dist/ chay@serveur:/srv/chay-app/dist/
```

Le DNS de `app.chay.fr` doit pointer vers le serveur ; Caddy obtient le certificat tout seul.

## Bloc Caddyfile

```caddyfile
app.chay.fr {
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
		output file /var/log/caddy/app.chay.fr.log
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
- **PocketBase** (`api.chay.fr`) garde son propre bloc (`reverse_proxy 127.0.0.1:8090`) ; régler « Trusted proxy » dans PocketBase. Le sidecar push (`127.0.0.1:8091`) n'apparaît **dans aucun bloc**.
- **CORS côté PocketBase** : `--origins=https://app.chay.fr,https://localhost` (APK Android).
