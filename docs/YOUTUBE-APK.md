# YouTube dans l'APK : lecteur intégré par page relais

## Pourquoi

Dans l'APK, l'app tourne à l'origine `https://localhost`. Une iframe YouTube chargée depuis cette origine envoie un référent que YouTube n'accepte pas : erreur 152/153 (« configuration du lecteur ») ou son sans image.

## Approche

| Plateforme | Lecteur |
|---|---|
| Site web (`membres.chay.fr`) | iframe `youtube-nocookie.com/embed/…` directe (inchangé) |
| APK Android | iframe `https://membres.chay.fr/youtube-embed.html?v=<id>&parent=https://localhost` |

La page relais (`public/youtube-embed.html` + `public/youtube-embed.js`, copiés dans `dist/` par le build) charge le lecteur officiel (IFrame API, hôte `youtube-nocookie.com`) depuis un vrai domaine : YouTube reçoit le référent `https://membres.chay.fr/`.

Le relais parle à l'app avec les mêmes messages que l'iframe directe (`onStateChange`, `infoDelivery`), plus `ready` et `onError`. Sécurité :
- **Parent** : il ne répond qu'à un parent de la liste fermée (`https://localhost`, `http://localhost`, `capacitor://localhost`, `https://membres.chay.fr`).
- **Commandes** : il n'exécute que `playVideo`, `pauseVideo`, `stopVideo` et `seekTo`.
- **Identifiant** : il n'accepte qu'un identifiant de vidéo valide.

### Repli « Ouvrir dans YouTube »

Il apparaît seulement en cas d'échec :
- **Intégration interdite par la chaîne** (YouTube 101/150) ou erreur de configuration (152/153) : « La chaîne n'autorise pas la lecture… ».
- **Vidéo privée, supprimée ou introuvable** (2/5/100).
- **Page relais injoignable**, sans réponse au bout de 15 s (hors ligne, page non déployée, en-têtes Caddy bloquants).

Un bouton « Réessayer » est proposé à côté.

### Limites

- Les vidéos dont le propriétaire interdit l'intégration ne seront **jamais** lues dans l'app (ni sur le site) : c'est un choix de la chaîne. Il reste le repli.
- Pas de lecture écran éteint ni en arrière-plan (règles YouTube). Réduire le lecteur arrête la vidéo, comme avant.
- Le bouton plein écran interne de YouTube peut ne rien faire dans la WebView. Le lecteur de l'app occupe déjà l'écran ; tourner le téléphone suffit.
- Il dépend de `membres.chay.fr` : si le site est en panne, l'APK passe au repli.
- Publicités et suggestions : celles de YouTube (`rel=0` limite les suggestions à la même chaîne).

## Déploiement

1. **Site** : déploiement habituel (`docs/DEPLOIEMENT.md`). `youtube-embed.html` et `youtube-embed.js` sont dans `dist/`, rien d'autre à copier.
2. **Caddy** : `membres.chay.fr` envoie `X-Frame-Options: DENY` à toutes les pages. La page relais doit pouvoir être affichée dans l'iframe de l'APK, et **seulement** de l'APK. Dans le bloc `membres.chay.fr`, ajouter :

```caddyfile
	# Lecteur YouTube de l'APK (docs/YOUTUBE-APK.md) : seule page affichable dans une iframe, et par l'APK seulement.
	@ytrelais path /youtube-embed.html /youtube-embed.js
	header @ytrelais {
		-X-Frame-Options
		-Content-Security-Policy-Report-Only
		Content-Security-Policy "frame-ancestors https://localhost http://localhost capacitor://localhost"
		Referrer-Policy "strict-origin-when-cross-origin"
		Cache-Control "no-cache"
		defer
	}
```

`defer` applique ces en-têtes après le bloc `header { … }` global : la suppression de `X-Frame-Options` l'emporte.

3. **APK** : reconstruire et publier (1.3.3, code 7) **après** les étapes 1 et 2. Sinon le lecteur passe au repli au bout de 15 s.

## Vérifications

```bash
curl -sI https://membres.chay.fr/youtube-embed.html
```
Attendu : `200`, `content-type: text/html`, **pas** de `x-frame-options`, `content-security-policy: frame-ancestors https://localhost http://localhost capacitor://localhost`, `referrer-policy: strict-origin-when-cross-origin`.

```bash
curl -sI https://membres.chay.fr/youtube-embed.js
```
Attendu : `200`, `content-type: text/javascript` (ou `application/javascript`).

```bash
curl -sI https://membres.chay.fr/
```
Attendu : `x-frame-options: DENY` toujours présent sur le reste du site.

Dans un navigateur, ouvrir `https://membres.chay.fr/youtube-embed.html?v=dQw4w9WgXcQ&parent=https://localhost` hors iframe : le message « Lecteur réservé à l'application Église Chay. » s'affiche.
