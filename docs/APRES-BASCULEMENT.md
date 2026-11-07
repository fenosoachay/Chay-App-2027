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

## 2. Autres points

- **Objets R2 non référencés** : aucun nettoyage automatique (seuls les téléversements incomplets le sont). Ajouter un rapport mensuel des vidéos qui ne sont plus utilisées.
- **Stockage des fichiers PocketBase sur R2** : PocketBase peut stocker tous ses fichiers sur un stockage S3 (réglages « Files storage »), sans changer l'app, si le disque du serveur devient trop petit.
- **Miniatures** : `Fichier` et `FichierAdmin` déclarent des miniatures `100x100` et `480x0` ; l'app ne les utilise pas encore (`?thumb=480x0`).
- **MFA des administrateurs** : activer le MFA natif de PocketBase pour `role = "admin"` (voir `docs/MIGRATION-COMPTES.md`).
