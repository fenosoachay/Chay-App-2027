# Bac à sable PocketBase local

Un PocketBase **0.40.6** (même version que le serveur) tourne en local sur une copie des données, pour tester la migration sans toucher au serveur réel `https://api.chay.fr`.

⚠️ La sauvegarde contient les **données réelles** (utilisateurs, messages…). Le bac à sable écoute seulement sur `127.0.0.1` : ne pas l'exposer, ne pas partager `C:\PB-local`.

## Emplacements (hors du dépôt)

| Élément | Chemin |
|---|---|
| Exécutable officiel (vérifié avec `checksums.txt` de la publication v0.40.6) | `C:\PB-local\bin\pocketbase.exe` |
| Données | `C:\PB-local\pb_data\` |
| Sauvegarde de référence | `C:\PB-local\apres-import-1.zip` |
| Journal (si lancé avec redirection) | `C:\PB-local\serve.log` |
| Hooks (dans le dépôt, branche `migration-pocketbase`) | `pocketbase\pb_hooks\` |

Le binaire, `pb_data` et les sauvegardes ne doivent **jamais** être ajoutés au dépôt (voir `.gitignore`).

## Démarrer

Dans un terminal PowerShell séparé, depuis la racine du worktree :

```powershell
New-Item -ItemType Directory -Force pocketbase\pb_hooks | Out-Null
C:\PB-local\bin\pocketbase.exe serve --http=127.0.0.1:8090 --dir=C:\PB-local\pb_data --hooksDir="$PWD\pocketbase\pb_hooks"
```

- API : http://127.0.0.1:8090/api/ — contrôle : http://127.0.0.1:8090/api/health
- Tableau de bord : http://127.0.0.1:8090/_/

Accès superuser local : la sauvegarde contient les superusers du serveur. Pour un compte propre au bac à sable (n'affecte que `C:\PB-local\pb_data`) :

```powershell
C:\PB-local\bin\pocketbase.exe superuser upsert <e-mail> <mot-de-passe> --dir=C:\PB-local\pb_data
```

## Arrêter

`Ctrl+C` dans le terminal qui l'exécute, ou :

```powershell
Stop-Process -Name pocketbase
```

## Réinitialiser depuis la sauvegarde

PocketBase doit être arrêté.

```powershell
Stop-Process -Name pocketbase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force C:\PB-local\pb_data
Expand-Archive C:\PB-local\apres-import-1.zip -DestinationPath C:\PB-local\pb_data
```

Puis redémarrer. Une sauvegarde PocketBase est simplement le contenu de `pb_data` (`data.db`, `auxiliary.db`, `storage\` s'il y a des fichiers).

## Pointer l'app sur le bac à sable

Dans le worktree, créer `.env.local` (ignoré par git) :

```
VITE_BACKEND=pocketbase
VITE_PB_URL=http://127.0.0.1:8090
```

Puis `npm run dev`. Sans `.env.local`, l'app reste sur Base44. Retirer ces lignes (ou le fichier) pour revenir à Base44.

## Vérifications rapides

```powershell
curl.exe -s http://127.0.0.1:8090/api/health
curl.exe -s "http://127.0.0.1:8090/api/collections/BibleVerse/records?perPage=1&fields=id"   # public : totalItems = 50739
curl.exe -s "http://127.0.0.1:8090/api/collections/Message/records?perPage=1&fields=id"      # anonyme : totalItems = 0
```

Avec PocketBase, une règle de liste non satisfaite **filtre** les résultats (liste vide, HTTP 200) ; la lecture directe d'un enregistrement non autorisé renvoie 404.
