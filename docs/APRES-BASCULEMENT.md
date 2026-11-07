# Après le basculement : améliorations prévues

Choses volontairement laissées comme sur Base44 pour ne pas changer l'app au moment du basculement.

## 1. Images des messages privés protégées par jeton

**Aujourd'hui** : les images envoyées dans une conversation (`Message.image_url`) sont publiques pour qui connaît l'adresse, comme sur Base44. L'adresse est imprévisible : identifiant de 24 caractères hexadécimaux et nom aléatoire de 20 caractères. Elle n'apparaît que dans les messages, visibles par les seuls participants.

**Risque** : une adresse copiée ou transférée reste lisible par n'importe qui, sans limite de durée.

**Plan** :
1. Collection dédiée `FichierMessage` avec un champ `fichier` **protégé** (`protected: true`) et une règle de lecture « participant de la conversation » (`conversation_id`, puis `participant_ids ~ @request.auth.id` sur la conversation).
2. À l'affichage, l'app demande un jeton de fichier (`pb.files.getToken()`, valable quelques minutes) et ajoute `?token=…` à l'adresse. C'est à modifier dans `ConversationView.jsx` et dans l'aperçu des images.
3. Migrer les 9 images de messages existantes vers `FichierMessage` et réécrire `Message.image_url`.
4. Supprimer les anciens fichiers publics.

À faire de même, si on le souhaite, pour les photos de groupe des conversations.

## 2. Formulaire « Prédication » (Sermon)

**Aujourd'hui** : le schéma (repris de Base44) exige `speaker` et `date`, que le formulaire admin ne propose pas. Créer une prédication depuis l'écran admin est donc impossible, sur Base44 comme sur PocketBase (aucune prédication dans l'export).

**À faire** : ajouter « Orateur » (texte) et « Date » au formulaire (`src/components/admin/adminSections.js`), ou rendre ces deux champs facultatifs dans le schéma.

## 3. Couverture de playlist obligatoire

**Aujourd'hui** : `Playlist.cover_url` est obligatoire (schéma Base44), alors que le formulaire la présente comme facultative : créer une playlist sans image échoue.

**À faire** : soit marquer « Couverture » obligatoire dans le formulaire, soit rendre le champ facultatif (avec une image par défaut à l'affichage).

## 4. MFA des administrateurs

Activer le MFA natif de PocketBase (mot de passe + code par e-mail) pour `role = "admin"` : voir `docs/MIGRATION-COMPTES.md`. Aucun champ MFA n'existait dans l'export Base44, donc pas de reprise.

## 5. Politique de confidentialité à écrire

L'app n'a pas de page de politique de confidentialité ; les conditions d'utilisation (inscription) parlent seulement de « services techniques ». À rédiger côté église, puis à publier dans l'app (Réglages → Confidentialité) et sur `app.chay.fr` :
- responsable du traitement et contact ;
- données collectées : profil, messages, prières, localisation facultative, jetons de notification ;
- sous-traitants et pays :
  - hébergeur du serveur PocketBase (`api.chay.fr`) ;
  - Cloudflare R2 (vidéos) ;
  - Google Firebase (notifications Android) ;
  - services Web Push des navigateurs ;
  - fournisseur SMTP ;
- durées de conservation, droits (accès, suppression : la suppression de compte existe déjà), cookies et stockage local.

## 6. Autres points

- **Objets R2 non référencés** : aucun nettoyage automatique (seuls les téléversements incomplets le sont). Ajouter un rapport mensuel des vidéos qui ne sont plus utilisées.
- **Stockage des fichiers PocketBase sur R2** : PocketBase peut stocker tous ses fichiers sur un stockage S3 (réglages « Files storage »), sans changer l'app, si le disque du serveur devient trop petit.
- **Miniatures** : `Fichier` et `FichierAdmin` déclarent des miniatures `100x100` et `480x0` ; l'app ne les utilise pas encore (`?thumb=480x0`).

