# Basculement des comptes vers PocketBase

Plan préparé, **non exécuté**. Base44 n'exporte pas les mots de passe : chaque membre devra en choisir un nouveau.

## 1. Préparer (avant le jour J)

| Étape | Détail |
|---|---|
| Comptes importés | `importer-donnees.mjs` crée les comptes avec leur id d'origine, `role` conservé, `verified` = `is_verified` de Base44, un mot de passe aléatoire **inconnu de tous** (jamais affiché ni stocké). |
| Comptes non vérifiés | La connexion par mot de passe leur est refusée (hook `auth.pb.js`). Le lien de réinitialisation prouve l'adresse : il faut vérifier, au premier essai réel, que PocketBase marque bien le compte vérifié après `confirm-password-reset` (voir les tests `auth`). |
| Envoi des e-mails | Un vrai service d'envoi transactionnel (Brevo, Mailjet, Amazon SES, Postmark…) branché en SMTP dans PocketBase — **pas** l'hébergeur web ni une boîte Gmail. |
| Domaine expéditeur | `no-reply@chay.fr` (ou `contact@chay.fr`) avec **SPF**, **DKIM** et **DMARC** publiés dans le DNS de chay.fr, vérifiés chez le prestataire. Sans cela, les messages finissent en spam. |
| Modèles | `pocketbase/config/users-auth.json` (français, sans lien Base44) ; `meta.appURL` = l'URL publique de l'app, pour que le lien pointe vers `/reset-password`. |
| Durée du lien | 30 minutes par défaut : trop court pour un envoi groupé. Le jour J, porter la durée du jeton de réinitialisation à **72 h** (réglage de la collection `users` dans l'admin PocketBase), puis la remettre à 30 min une semaine après. |
| Prévenir | Annonce dans l'app Base44 (encore active) et à l'église quelques jours avant : « vous recevrez un e-mail pour choisir un nouveau mot de passe ». Réduit les signalements comme spam et les messages ignorés. |

## 2. Envoyer les e-mails de réinitialisation (jour J)

Script à écrire au moment du basculement (même modèle que les scripts existants : simulation par défaut, `--appliquer`) qui, pour chaque compte importé, appelle l'envoi de réinitialisation de PocketBase (`POST /api/collections/users/request-password-reset`, ou `$mails.sendRecordPasswordReset` côté serveur).

| Règle d'envoi | Pourquoi |
|---|---|
| **Lots de 50, un lot toutes les 10 minutes** (aujourd'hui 15 comptes : un seul lot suffit) | les prestataires et les boîtes de réception se méfient des pics soudains d'un domaine neuf |
| Les membres les plus actifs d'abord | les premières ouvertures améliorent la réputation de l'expéditeur |
| Un seul e-mail par adresse ; reprise possible (journal des adresses déjà traitées, par id) | pas de doublon si le script est relancé |
| Respecter la limite de tentatives `request-password-reset` (ou passer par le script serveur, qui n'est pas soumis à la limite HTTP) | éviter les 429 |
| Aucun lien raccourci, peu d'images, texte simple, expéditeur reconnaissable (« Église Chay ») | filtres anti-spam |

### Texte de l'e-mail (objet : « Votre nouvelle application Église Chay : choisissez votre mot de passe »)

> Bonjour,
>
> L'application de l'Église Chay change de serveur. Vos données (profil, messages, favoris, progression) ont été conservées, mais pour des raisons de sécurité votre mot de passe n'a pas pu être transféré.
>
> Pour continuer à utiliser l'application, choisissez un nouveau mot de passe en ouvrant ce lien :
> **Choisir mon mot de passe** (lien valable 72 heures, utilisable une seule fois)
>
> Si le lien a expiré, utilisez « Mot de passe oublié » sur l'écran de connexion.
> Si vous n'êtes pas à l'origine de ce compte, ignorez simplement ce message.
>
> — L'équipe de l'Église Chay

(Pour le jour J, ce texte remplace temporairement `resetPasswordTemplate`, puis on revient au modèle habituel.)

## 3. Adresses invalides et cas particuliers

| Cas | Traitement |
|---|---|
| Rebond définitif (adresse inexistante) | relevé dans le tableau de bord du prestataire ; liste exportée ; **aucune relance automatique** (nuit à la réputation) |
| Rebond temporaire (boîte pleine) | une seule relance 48 h plus tard |
| Adresse invalide dans l'export | signalée par le script (format), non envoyée |
| Membre qui ne reçoit rien | contact direct (église, WhatsApp) ; l'admin peut renvoyer le lien via `inviteUser` (qui envoie aussi un e-mail « définir le mot de passe ») ou corriger l'adresse dans l'admin PocketBase |
| Membre inscrit avec Google sur Base44 | n'a jamais eu de mot de passe : même e-mail ; il pourra aussi utiliser Google une fois configuré (section 4) |
| Comptes inactifs depuis longtemps | envoyés en dernier, éventuellement avec un rappel unique à J+7 |
| Suivi | tableau : envoyés / ouverts / mot de passe choisi (`users` dont le mot de passe a changé depuis le jour J) / rebonds |

Alternative envisagée et écartée pour l'instant : un lien « première connexion » par code à usage unique (OTP). Il évite le mot de passe, mais l'écran de connexion actuel ne le propose pas ; le lien de réinitialisation fonctionne avec l'app telle qu'elle est.

## 4. Google (à configurer plus tard — non codé)

| Élément | Où | Valeur / action |
|---|---|---|
| Projet | Google Cloud Console | projet « Église Chay » |
| Écran de consentement OAuth | APIs & Services → OAuth consent screen | type « Externe », nom « Église Chay », logo, e-mail d'assistance, domaines autorisés `chay.fr`, liens vers la politique de confidentialité et les conditions ; portées `openid`, `email`, `profile` ; passer en « Production » |
| Client OAuth « Application Web » | APIs & Services → Credentials | **URI de redirection autorisée : `https://api.chay.fr/api/oauth2-redirect`** (route OAuth2 de PocketBase) ; origine JavaScript : l'URL publique de l'app |
| PocketBase | collection `users` → OAuth2 → Google | Client ID et Client secret du client Web ; correspondance des champs (`name` → `name`, `avatarURL` → photo si souhaité) |
| Comptes existants | PocketBase | à la première connexion Google, PocketBase rattache le compte qui a la même adresse e-mail si Google la déclare vérifiée — à tester avant ouverture |
| Android (Capacitor) | app + `AndroidManifest.xml` | la connexion OAuth ne doit pas s'ouvrir dans la WebView : l'ouvrir avec `@capacitor/browser`, puis revenir dans l'app par un **lien profond** `io.chay.app://auth/callback` (schéma déjà déclaré dans `strings.xml` : `custom_url_scheme`) → ajouter l'`intent-filter` correspondant (`VIEW`, `BROWSABLE`, `scheme="io.chay.app"`, `host="auth"`) et écouter `App.addListener('appUrlOpen')` |
| Client OAuth « Android » (si connexion Google native un jour) | Credentials | nom de package `io.chay.app` + empreinte **SHA-1** de la clé de signature (Play App Signing) ; nécessiterait une route serveur qui vérifie le jeton d'identité Google |
| Côté app | `src/lib/authMfaFlow.js`, `authMfa.js`, `Login.jsx` | remplacer `loginWithProvider` (Base44) par `pb.collection('users').authWithOAuth2({ provider: 'google' })` dans l'adaptateur |
