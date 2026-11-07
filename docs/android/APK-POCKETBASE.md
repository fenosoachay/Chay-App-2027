# APK et PocketBase (`https://api.chay.fr`)

Examen de `capacitor.config.json` et de `android/` dans le dossier habituel (`Chay-App-2027`), **sans modification**. Le correctif proposé est `docs/android/apk-pocketbase.patch` (à appliquer au moment du basculement avec `git apply`).

## Ce qui est déjà bon

| Point | État |
|---|---|
| Appels API | Le WebView sert l'app sur `https://localhost` (`androidScheme: https`) ; les requêtes vers `https://api.chay.fr` sont de simples `fetch`, pas de la navigation. **Aucune modification native n'est nécessaire** : il suffit d'un build web `VITE_BACKEND=pocketbase`. |
| CORS | PocketBase accepte toutes les origines par défaut. Pour restreindre : `--origins=https://app.chay.fr,https://localhost` (ajouter `capacitor://localhost` pour iOS). |
| Permissions | `INTERNET`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE(_MEDIA_PLAYBACK)` : nécessaires. Localisation fine et approximative : utilisées par l'option facultative de localisation. |
| Icône de notification | `@drawable/ic_stat_chay` déclarée pour FCM (`default_notification_icon`). |
| Canal `chay-default` | Créé par l'app au démarrage (`usePushNotifications.js`, importance haute) ; le sidecar l'indique dans chaque message (`android.notification.channel_id`). |
| Firebase | `google-services.json` présent ; le projet doit être **le même** que celui du compte de service `FIREBASE_SERVICE_ACCOUNT` du sidecar. |
| Liens externes | `ExternalLinkPlugin` demande confirmation avant d'ouvrir le navigateur. |

## Les deux modifications gradle indexées

`capacitor.build.gradle` et `capacitor.settings.gradle` ajoutent le module `capacitor-browser` : c'est la sortie de `npx cap sync android` après l'ajout de `@capacitor/browser` dans `package.json`. Elles sont cohérentes, et reprises dans le correctif. Le plugin n'est pas encore utilisé par `src/` ; il servira si la connexion Google par PocketBase est ajoutée (voir plus bas).

## Correctif proposé (`apk-pocketbase.patch`)

| Fichier | Changement | Pourquoi |
|---|---|---|
| `capacitor.config.json` | `allowNavigation: ["*"]` → `[]` | Avec `*`, n'importe quel site peut s'ouvrir **dans** le WebView de l'app, avec accès au pont Capacitor. L'app n'a besoin d'aucune navigation externe ; les appels à l'API ne sont pas concernés. À appliquer à l'APK PocketBase seulement : la connexion Google de Base44 naviguait vers `base44.app`. |
| `AndroidManifest.xml` | `android:usesCleartextTraffic="false"` | `minSdk 22` : sur Android 5 à 8, le HTTP en clair est autorisé par défaut. Tout est en HTTPS. |
| `AndroidManifest.xml` | `android:allowBackup="false"` | La sauvegarde Android emporterait le jeton de session PocketBase (stockage du WebView). Conséquence : après restauration sur un nouveau téléphone, il faut se reconnecter. |
| `AndroidManifest.xml` | `default_notification_channel_id = chay-default` | Un push reçu avant le premier lancement de l'app (canal pas encore créé) utilise le bon canal au lieu du canal « Divers ». |
| `capacitor.build.gradle`, `capacitor.settings.gradle` | module `capacitor-browser` | Les deux modifications indexées. |

Après `git apply` : `npm run build` (avec `VITE_BACKEND=pocketbase`, `VITE_PB_URL=https://api.chay.fr`, `VITE_PUBLIC_APP_URL=…`), puis `npx cap sync android`. La copie générée `android/app/src/main/assets/capacitor.config.json` du dossier habituel date d'avant l'ajout de `allowNavigation` : `cap sync` la régénère.

## Connexion Google / lien profond OAuth

Aucun schéma de lien profond n'est déclaré : `custom_url_scheme` vaut `io.chay.app`, mais aucun `intent-filter`. La connexion Google n'est pas migrée en mode PocketBase (seuls les écrans MFA non routés l'utilisaient), donc **rien n'est nécessaire maintenant**. Si elle est voulue plus tard :
1. fournisseur Google dans PocketBase avec l'adresse de retour `https://api.chay.fr/api/oauth2-redirect` ;
2. ouverture par `@capacitor/browser` ;
3. `intent-filter` `io.chay.app://auth` (ou App Link vérifié `https://app.chay.fr/auth`) pour revenir dans l'app.

## À tester avec un vrai téléphone

Connexion, envoi de fichiers (15 Mo / 100 Mo / vidéo R2), réception d'un push (app fermée, en arrière-plan, au premier plan), clic sur le push, liens partagés (`VITE_PUBLIC_APP_URL`), lecture audio en arrière-plan.
