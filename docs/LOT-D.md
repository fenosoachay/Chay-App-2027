# Lot D (1.3.6) : migration de schéma et fichiers serveur

## Ce qui change dans le schéma

| Collection | Changement |
|---|---|
| `Announcement` | Nouveau champ `event_time` (texte HH:MM, motif `^([01][0-9]\|2[0-3]):[0-5][0-9]$`) et nouveau champ `archived` (booléen). Règles `listRule` et `viewRule` : `@request.auth.id != "" && (archived = false \|\| @request.auth.role = "admin")`, donc une réunion archivée n'est plus visible que des admins. |
| `ChurchHistory` (nouvelle) | Page « Histoire de l'église » : `title`, `body` (texte riche), `photos` (json, liste d'URL). |
| `StaffMember` (nouvelle) | « Personnel » : `name`, `role`, `photo_url`, `order`. |

Les deux nouvelles collections sont lisibles par tous les membres connectés ; seuls les admins peuvent écrire. Aucune donnée existante n'est modifiée. Fragment pour `collections.json` : `pocketbase/config/collections-lot-d.json` (les deux nouvelles collections).

## Ordre de déploiement

1. **Migration** (avant les hooks : la tâche d'archivage lit le champ `archived`).

   🪟 PC, tunnel ouvert dans une fenêtre à part : `ssh -N -L 8092:127.0.0.1:8090 $SERVEUR`. Puis :

   ```powershell
   cd C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration
   $env:PB_URL = "http://127.0.0.1:8092"
   $env:PB_EMAIL = Read-Host "E-mail superuser"
   $s = Read-Host "Mot de passe superuser" -AsSecureString
   $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
   $env:PB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
   [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b); Remove-Variable s, b
   node pocketbase/scripts/migrer-lot-d.mjs
   node pocketbase/scripts/migrer-lot-d.mjs --appliquer
   Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL
   ```

   La simulation doit annoncer exactement :
   - `Announcement event_time : nouveau champ texte HH:MM`
   - `Announcement archived : nouveau champ booléen`
   - `Announcement listRule …` et `Announcement viewRule … : réunions archivées réservées aux admins`
   - `ChurchHistory : nouvelle collection`
   - `StaffMember : nouvelle collection`

   Le script peut être relancé : il répond alors « Déjà à jour ». Ensuite, exporter les collections depuis le tableau d'administration pour mettre à jour `C:\Export-Base44\_outil\pb\collections.json`.

2. **Fichiers serveur** (hooks) : copier `pocketbase/pb_hooks/reunions.pb.js` (nouveau) et `pocketbase/pb_hooks/lib/reunions.js` (nouveau) ; `zz_demarrage.pb.js` (commentaire seulement) peut suivre. Redémarrer PocketBase : PocketBase ne recharge pas les hooks tout seul. Le journal doit afficher `5 tâches planifiées (fichiers_orphelins, push_reessais, reunions_archivage, televersements_incomplets, verset_du_jour)`.
3. **Site**, puis **APK 1.3.6**.

## Réunions : comportement

- **Archivage automatique** : la tâche `reunions_archivage` (toutes les 5 min) archive une réunion dès que sa date et son heure (heure de Paris) sont passées.
- **Réunions sans heure** (créées avant 1.3.6) : archivées à la fin de leur journée (23:59).
- **Côté membre** : l'app masque aussi immédiatement une réunion dont l'heure du jour est passée.
- **Archivage manuel** (admin, vérification après déploiement) : `POST /api/fn/archiverReunions`, que renvoie `{ examinees, archivees }`.
