# Playlists dans toutes les sections (1.3.6)

Section > Playlist > Sous-playlist > contenus (un seul niveau), pour Musique, Prédication, YouTube, Articles et Galerie. Films ne change pas.

## Données

- **Playlist** : `parent_id` vide = playlist de section ; sinon = sous-playlist de cette playlist. `category` vaut `music`, `sermons`, `youtube`, `articles` ou `gallery` (`films` et `other` restent).
- **PlaylistTrack** (sans changement) relie un contenu (`track_id`) à une sous-playlist (`playlist_id`) ; `order` fixe l'ordre dans la sous-playlist.
- Un contenu est **rangé** s'il est relié à une sous-playlist de sa section. Les contenus non rangés restent visibles pour les membres, dans la rubrique « Non classés » qui garde l'affichage d'avant. Le tableau de bord admin les liste, section par section.

## Migration de schéma (production, à faire AVANT de déployer le site et l'APK 1.3.6)

Seule la collection `Playlist` change : un nouveau champ `parent_id` (texte, 64 caractères) et trois catégories ajoutées. Aucune donnée n'est modifiée. La migration est idempotente : relancée, elle répond « Déjà à jour ».

🪟 **PC**, tunnel ouvert dans une fenêtre à part : `ssh -N -L 8092:127.0.0.1:8090 $SERVEUR`. Puis, dans une autre fenêtre :

```powershell
cd C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration
$env:PB_URL = "http://127.0.0.1:8092"
$env:PB_EMAIL = Read-Host "E-mail superuser"
$s = Read-Host "Mot de passe superuser" -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
$env:PB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b); Remove-Variable s, b
node pocketbase/scripts/migrer-playlists.mjs
node pocketbase/scripts/migrer-playlists.mjs --appliquer
Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL
```

1. La première commande `node` est une **simulation**. Elle doit annoncer exactement :
   - `category : valeurs ajoutées youtube, articles, gallery`
   - `parent_id : nouveau champ texte (64)`
2. La seconde applique, puis affiche `Appliqué : Playlist est à jour.`

Équivalent dans le tableau d'administration (`http://127.0.0.1:8092/_/`), Collections → Playlist :
- ajouter un champ texte `parent_id`, longueur maximale 64 ;
- dans `category`, ajouter les valeurs `youtube`, `articles` et `gallery`.

Pour garder `C:\Export-Base44\_outil\pb\collections.json` à jour, exporter ensuite les collections depuis ce tableau.

Sans cette migration, le site 1.3.6 fonctionne encore comme avant. En revanche, l'admin ne peut créer ni sous-playlist ni playlist YouTube, Articles ou Galerie : le serveur refuse le champ ou la catégorie.

## Après déploiement

L'alerte du tableau de bord liste les contenus à ranger. Pour chaque section :
1. créer une playlist puis ses sous-playlists (bouton « Nouvelle sous-playlist » sur la playlist) ;
2. modifier chaque contenu listé pour choisir sa sous-playlist (champ obligatoire).

Les titres de Musique et Prédication déjà placés directement dans une playlist restent accessibles dans cette playlist, sous « Non classés », jusqu'à ce qu'ils soient rangés.
