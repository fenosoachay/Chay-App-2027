# Audit de fin de Phase 5 : dépendances à Base44 en mode PocketBase

Périmètre : `src/`, `public/` (manifest, service worker), `index.html`, `vite.config.js`, `capacitor.config.json`, `android/`.
Méthode : recherche des imports du SDK, des domaines Base44, des fonctions et entités appelées par l'app comparées aux routes et collections PocketBase, des écrans qui afficheraient « pas encore migré ».

## Bilan

- **Entités** : toutes celles qu'utilise l'app existent dans PocketBase.
- **Fonctions** : toutes ont une route `/api/fn/…` sauf `syncBibleTranslation` (écran désactivé, import par script).
- **Intégrations** : seul `Core.UploadFile` est utilisé (migré).
- **Authentification** : toutes les méthodes utilisées sont migrées sauf `loginWithProvider` (Google), utilisé seulement par les écrans MFA non routés.
- **Domaines** : restent les logos sur `media.base44.com` (à remplacer avant l'arrêt de Base44).

## Tableau

| # | Fichier | Problème | Correction | Risque | Statut |
|---|---|---|---|---|---|
| 1 | `src/lib/publicOrigin.js` | Liens partagés depuis l'APK (verset, radio) vers `chay.base44.app` | `VITE_PUBLIC_APP_URL` en mode PocketBase (défaut `https://app.chay.fr`) | moyen | **corrigé** |
| 2 | 7 écrans admin (`EntityCrud`, `MediaUploader`, `CreatePlaylistModal`, `PuzzleAdminPanel`, `PersonalityQuizAdminPanel`, `playlistAttachment`, `usePushNotifications`) | Messages « dashboard Base44 → Entities → Publish », « Publish → Mobile app » | `backendText()` : texte PocketBase en mode PocketBase | faible | **corrigé** |
| 3 | `src/components/bible/BibleSyncPanel.jsx` | Bouton « Synchroniser » → erreur « pas encore migré » | Bouton désactivé + explication (import par `importer-baiboly.mjs`) | faible | **corrigé** |
| 4 | `src/pages/Messages.jsx`, `src/hooks/useUnreadMessages.js` | Un admin voit **toutes** les conversations dans sa boîte et le badge compte tous les messages (198 → « 99+ ») | N'afficher et ne compter que les conversations où l'on participe | moyen | **corrigé** (affichage) ; règles : voir § Conversations |
| 5 | `public/manifest.json` | Icônes PWA sur `media.base44.com` | Copier le logo dans `public/assets/` et pointer dessus (fichier statique commun aux deux modes) | **élevé** après l'arrêt de Base44 | à valider : fichiers à récupérer |
| 6 | `src/pages/Login.jsx` | Logo de la page de connexion sur `media.base44.com` | Logo local, choisi selon le mode | **élevé** idem | à valider |
| 7 | `src/lib/mediaConstants.js` | `RADIO_LOGO`, `OFFLINE_PATTERN` sur `media.base44.com` | Images locales | moyen | à valider |
| 8 | `src/components/admin/EntityCrud.jsx` (`removePlaylist`) | `PlaylistTrack.list('-playlist_id eq "<id>"', 500)` : filtre passé comme **tri**. En PocketBase l'erreur est ignorée : la playlist est supprimée, ses contenus et liens restent orphelins | `PlaylistTrack.filter({ playlist_id: id }, null, 500)` | moyen | à valider (change aussi le mode Base44, dont le comportement exact n'est pas connu) |
| 9 | `src/components/admin/adminSections.js` (Sermon) | `speaker` et `date` obligatoires dans le schéma mais absents du formulaire : création impossible (aucune prédication n'existe dans l'export Base44) | Ajouter les deux champs au formulaire, ou rendre `speaker` / `date` facultatifs | faible | à valider |
| 10 | `adminSections.js` (Article) | Case « Couverture recadrée » (`cover_cropped`) absente du schéma : ignorée (comme sur Base44) | Ajouter un champ booléen si voulu | faible | à valider |
| 11 | `public/sw.js`, `usePushNotifications.js` | Nouveaux push (prière, thème, verset) : le clic ouvre l'accueil (comme Base44) | `prayer` / `theme_*` → `/requests` | faible | proposé |
| 12 | `src/lib/app-params.js` | `import { getAccessToken } from '@base44/sdk'` : non appelé en mode PocketBase, mais le SDK reste dans le bundle | Retirer quand le mode Base44 sera abandonné | faible | plus tard |
| 13 | `vite.config.js` | `@base44/vite-plugin` (options de développement seulement) | Retirer après le basculement | faible | plus tard |
| 14 | `src/api/base44Client.js`, `src/lib/upload.js` | `chay.base44.app`, `base44.app` | Branche Base44 seulement ; `REMOTE_APP_URL` de `upload.js` n'est plus utilisé | aucun | rien à faire |
| 15 | `src/components/ui/image*.js(x)` | Redimensionnement Wix pour `media.base44.com` | Les adresses migrées ne sont plus sur ce domaine : affichage simple | aucun | rien à faire |
| 16 | `src/lib/authMfa*.js`, `Mfa.jsx`, `OAuthConsent.jsx` | Points d'accès `/api/apps/…` de Base44, `loginWithProvider` | Non routés en mode PocketBase (test de garde) | aucun | rien à faire |
| 17 | `capacitor.config.json` | `allowNavigation: ["*"]` | Voir `docs/android/APK-POCKETBASE.md` | moyen | correctif proposé |

## Points ouverts vérifiés

### Écran admin EntityCrud
Test `pocketbase/tests/admin-entitycrud.local.test.js` (vrai adaptateur) : 12 sections, chacune listée avec son tri, créée avec les champs du formulaire (+ `created_by_admin`), modifiée et supprimée par un admin ; un membre est refusé en création, modification et suppression.

| Refusé à un admin | Cause |
|---|---|
| Créer une prédication (Sermon) | `speaker` et `date` obligatoires, absents du formulaire (#9) |
| Créer une playlist sans couverture | `cover_url` obligatoire (schéma Base44) |
| Créer un message de contact depuis l'écran | Section en lecture seule (normal) |

Rien d'autre n'est refusé : les règles donnent création, modification et suppression aux admins sur les 12 entités. `created_by_admin` et `cover_cropped` ne sont pas dans le schéma et sont ignorés.

### Conversations : ce que permettent les règles
**Bloc 7 : corrigé.** `Message` et `Conversation` : seuls les participants lisent, modifient et suppriment (un admin participant peut supprimer les messages des autres dans **ses** conversations, pour la modération). Un admin non participant est refusé (404), comme un anonyme ; le superuser PocketBase garde l'accès. `Message.create` est fermé (route `createMessage`). Le hook d'intégrité de `read_by` / `pinned_by` / `muted_by` s'applique désormais aussi aux admins. Test : `pocketbase/tests/fn-conversations-privees.integration.mjs`.

### Politique de confidentialité
Il n'y a pas de page dédiée dans l'app. Les conditions d'utilisation (dialogue de l'inscription, `Register.jsx`) parlent de « services techniques utilisés pour faire fonctionner l'application et ses notifications », sans nommer d'hébergeur ni de pays. Les réglages « Confidentialité et données » (`PrivacySection.jsx`) traitent de la localisation et renvoient vers Contact pour une copie des données. Avec PocketBase (`api.chay.fr`), Cloudflare R2, Firebase et le fournisseur SMTP, une vraie politique devrait les nommer : à rédiger côté église.
