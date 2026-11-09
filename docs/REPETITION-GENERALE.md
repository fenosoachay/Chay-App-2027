# Répétition générale du basculement Base44 → PocketBase

Procédure à suivre pour la répétition, puis à rejouer le jour J. Chaque étape indique son but, où l'exécuter, les commandes, le résultat attendu, la durée approximative, le risque et la façon d'annuler.

Règles pendant toute la répétition :
- l'export Base44 reste **en clair dans `C:\Export-Base44`**, jamais dans git ;
- aucun secret n'est écrit dans le dépôt ni affiché à l'écran ;
- `NOTIFICATIONS_MODE` reste à `test` et `FICHIERS_NETTOYAGE` à `simulation`.

## Trois points à connaître avant de commencer

1. **Le nouvel export modifie Base44.** La fonction d'export n'existe plus côté Base44. Il faut la redéployer et ajouter un secret `EXPORT_SECRET`, puis les retirer : c'est une **modification de l'app Base44**, à décider.
2. **L'envoi vers le vrai R2 est possible depuis le commit `8800dfab`**, avec l'option `--r2-reel` de `migrer-fichiers.mjs` et une confirmation à taper (étape 6).
3. **Restaurer `schema-vide.zip` remet aussi les réglages et les superusers du 7 novembre.** Après la restauration, il faut se connecter avec le mot de passe superuser de cette date, puis relancer `configurer-production.mjs` et revérifier les sauvegardes S3 (étape 2c).

**Export actuel** (5 novembre, statistiques seulement) : 60 entités, 53 463 enregistrements, dont 50 739 versets, 15 `User`, 17 conversations, 198 messages, 35 `MemberProfile`, 3 `Video`. La production compte 19 comptes, dont des comptes de test ; le nouvel export donnera le chiffre exact.

## Préparation

**Tunnel** : dans une fenêtre PowerShell à part, laissée ouverte pendant tout le travail :
```powershell
ssh -N -L 8092:127.0.0.1:8090 $SERVEUR
```

**Saisie des secrets** : définir cette fonction dans la session PowerShell de travail (reprise de `DEPLOIEMENT.md` §3c). Le secret saisi n'est jamais affiché.
```powershell
function Lire-Secret($invite) { $s = Read-Host $invite -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }
```

**Variables d'environnement : attention, les scripts n'utilisent pas tous les mêmes noms.**

| Script | Adresse | Identifiants superuser |
|---|---|---|
| `export-base44.mjs` (étape 1) | — | `BASE44_APP_ID`, `BASE44_TOKEN`, `EXPORT_SECRET` |
| `importer-donnees.mjs` (étape 4) | `PB_URL` | `PB_EMAIL`, `PB_PASSWORD` |
| `comparer-comptages.mjs` (étape 4) | `PB_URL` | `PB_EMAIL`, `PB_PASSWORD` |
| `importer-baiboly.mjs` (étape 5) | option `--pb` | **`PB_SU_EMAIL`, `PB_SU_PASSWORD`** |
| `migrer-fichiers.mjs` (étape 6) | option `--pb` | **`PB_SU_EMAIL`, `PB_SU_PASSWORD`** |

⚠️ Si `PB_SU_EMAIL` / `PB_SU_PASSWORD` manquent, `importer-baiboly.mjs` et `migrer-fichiers.mjs` prennent les identifiants **du bac à sable** (`C:\PB-local\identifiants-test.txt`) et les enverraient au vrai serveur par le tunnel. Définissez-les **toujours** avant ces deux scripts.

Retirez toutes les variables à la fin :
```powershell
Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL, Env:PB_SU_PASSWORD, Env:PB_SU_EMAIL -ErrorAction SilentlyContinue
```

---

## Étape 0. Vérifications préalables

- **But** : éviter une surprise en cours de route.
- **Où** : serveur, PC, tableau de bord Cloudflare.
- **Temps** : 15 min.
- **Risque** : aucun, tout est en lecture.

🐧 **Serveur**
```bash
df -h /opt
```
```bash
sudo du -sh /opt/pocketbase/pb_data
```
```bash
sudo grep -E '^(NOTIFICATIONS_MODE|FICHIERS_NETTOYAGE)=' /etc/chay/pocketbase.env
```
```bash
sudo grep -E '^NOTIFICATIONS_MODE=' /etc/chay/push.env
```
Attendu :
- plusieurs Go libres sur `/opt` ;
- `NOTIFICATIONS_MODE=test` dans les deux fichiers, et `FICHIERS_NETTOYAGE=simulation`.

🪟 **PC**
```powershell
Get-PSDrive C | Select-Object Used, Free
```
Prévoir au moins 6 Go libres : l'export, environ 2 Go de fichiers, les sauvegardes et une marge.

**Cloudflare** :
- R2 → `chay-sauvegardes` : la sauvegarde `@auto_…` de la nuit doit être présente.
- Usage du compte : l'offre gratuite donne 10 Go de stockage ; 1,87 Go de vidéo plus les sauvegardes y tiennent.

**Débit montant du PC** : le mesurer avec un test de débit. Il fixe la durée d'envoi de la vidéo : environ 25 min à 10 Mbit/s, 5 min à 50 Mbit/s, près de 2 h à 2 Mbit/s.

**Caddy n'est pas concerné** : le script envoie la vidéo directement du PC vers R2, l'import passe par le tunnel, et dans l'app les vidéos vont aussi directement vers R2, par adresses signées.

## Étape 1. Nouvel export complet de Base44

- **But** : avoir les données du jour, en clair, dans `C:\Export-Base44`, jamais dans git.
- **Où** : Base44 (éditeur), puis PC.
- **Temps** : 30 à 60 min, plus le téléchargement des fichiers (environ 2 Go).

**1a. Mettre l'export précédent de côté** (🪟 PC). L'outil saute les entités déjà terminées : il doit repartir de zéro.
```powershell
cd C:\Export-Base44
```
```powershell
New-Item -ItemType Directory _archive-2026-11-05 | Out-Null
```
```powershell
Move-Item *.json, *.csv, _travail -Destination _archive-2026-11-05 -ErrorAction SilentlyContinue
```
Le dossier `fichiers\` reste en place : les fichiers déjà téléchargés ne sont pas retéléchargés.

**1b. Générer le secret, sans l'afficher** (🪟 PC). Il est copié dans le presse-papiers :
```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard; Remove-Variable b
```

**1c. Dans Base44** (⚠️ modification de l'app : décision à prendre) :
1. Dans les réglages de l'app, section des secrets ou variables d'environnement des fonctions, créer `EXPORT_SECRET` et coller la valeur.
2. Redéployer la fonction `exportData` à partir de `C:\Export-Base44\_outil\exportData-entry.ts`. Elle ne fait que des lectures et exige un admin **et** le secret.

**1d. Lancer l'export** (🪟 PC) :
```powershell
cd C:\Export-Base44\_outil
```
```powershell
$env:BASE44_APP_ID = Read-Host "Identifiant de l'app Base44"
```
```powershell
$env:BASE44_TOKEN = Lire-Secret "Jeton d'un admin Base44"
```
```powershell
$env:EXPORT_SECRET = Get-Clipboard; Set-Clipboard -Value " "
```
```powershell
node export-base44.mjs counts
```
```powershell
node export-base44.mjs export
```
```powershell
node export-base44.mjs fichiers
```
```powershell
node export-base44.mjs rapport
```
```powershell
node telecharger-fichiers.mjs taille
```
```powershell
node telecharger-fichiers.mjs telecharger
```
```powershell
Remove-Item Env:BASE44_TOKEN, Env:EXPORT_SECRET, Env:BASE44_APP_ID
```
Attendu :
- `counts.json` et un fichier `<Entité>.json` par entité, avec les mêmes nombres ;
- `rapport.json` sans erreur ;
- les fichiers téléchargés dans `C:\Export-Base44\fichiers\`.

**1e. Retirer l'accès** (Base44) : supprimer la fonction `exportData` **et** le secret `EXPORT_SECRET`. Déconnecter la session admin qui a fourni le jeton.

- **Risque** : faible, la fonction ne fait que lire. Un export interrompu reprend où il s'était arrêté.
- **Annulation** : supprimer la fonction et le secret. Rien n'est écrit dans les données Base44.

## Étape 2. Sauvegarde du serveur, puis retour à un état propre

- **But** : pouvoir tout remettre comme avant, puis rejouer exactement le jour J.
- **Où** : tableau de bord PocketBase (par le tunnel) et serveur.
- **Temps** : 20 min.

**2a. Sauvegarde de l'état actuel** : `http://127.0.0.1:8092/_/` → Settings → Backups → **New backup**, avec un nom du type `avant-repetition-AAAA-MM-JJ.zip`.
- Elle part dans R2 (`chay-sauvegardes`).
- La télécharger (**Download**) dans `C:\Sauvegardes-Chay\`, sur un disque chiffré.

**2b. Base de départ.** Recommandé : **`schema-vide.zip`**, le schéma sans les données, ce qui reproduit le jour J.
- `apres-import-1.zip` est déconseillé : l'import met à jour les enregistrements mais ne supprime rien. Un enregistrement supprimé dans Base44 depuis le 7 novembre resterait.
- Settings → Backups → **Upload backup**, choisir `C:\Sauvegardes-Chay\schema-vide.zip`, puis **Restore** et confirmer.

**2c. Après la restauration**, les réglages et les superusers sont ceux du 7 novembre :
1. Se connecter avec le mot de passe superuser de cette date. S'il est perdu, sur le serveur : `sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert <e-mail> "<mot de passe>" --dir=/opt/pocketbase/pb_data`, en saisissant le mot de passe avec `read -s`, comme dans `RESTAURATION.md`.
2. Relancer `configurer-production.mjs`, d'abord en simulation puis avec `--appliquer`, comme dans `DEPLOIEMENT.md` §3c.
3. Vérifier **Settings → Backups** : S3 `chay-sauvegardes`, point d'accès `.eu.`, cron `0 3 * * *`, 7 sauvegardes conservées.

🐧 **Serveur** :
```bash
sudo journalctl -u pocketbase --since "10 min ago" --no-pager | grep -F -e "[chay] hooks chargés" -e "failed to execute"
```
Les hooks, `/etc/chay`, le site et le sidecar ne font pas partie de la sauvegarde : ils restent tels quels.

**Ce qui est perdu** : tout ce qui a été créé depuis le 7 novembre à 22:54 :
- les comptes de test (test1, test2, test-admin…) ;
- leurs messages, publications et contenus de test (films « Test » / « Test2 »…) ;
- les fichiers de `Fichier` et `FichierAdmin`, dont les 134 Mo de vidéos de test ;
- les jetons de téléphones et les abonnements push ;
- les réglages modifiés depuis.

**Ce qui n'est pas effacé** : les vidéos de test **déjà envoyées sur R2** (dossier `videos/…` du bucket des vidéos). Les supprimer à la main dans Cloudflare si souhaité.

- **Annulation** : restaurer `avant-repetition-….zip` de la même façon (Upload si besoin, puis Restore).

## Étape 3. Recréer les comptes de test

- **But** : pouvoir tester sans toucher aux vrais membres.
- **Où** : `membres.chay.fr`, puis le tableau de bord.
- **Temps** : 10 min.

1. Inscrire test1 et test2 avec les adresses déjà présentes dans `NOTIFICATIONS_TEST_EMAILS`.
2. Passer `test-admin` en `role = admin` dans le tableau de bord.

⚠️ Les e-mails d'authentification (code d'inscription, mot de passe oublié) **partent même en mode `test`**. Pendant la répétition, ne **jamais** déclencher « mot de passe oublié » pour un vrai membre.

## Étape 4. Import des données et comparaison des comptages

- **But** : retrouver toutes les données de Base44 dans PocketBase, avec les mêmes nombres.
- **Où** : PC, par le tunnel.
- **Temps** : 20 à 60 min (environ 53 000 enregistrements, par lots de 200).

**4a. Import** (🪟 PC) :
```powershell
cd C:\Export-Base44\_outil\pb
```
```powershell
node importer-donnees.mjs
```
```powershell
$env:PB_URL = "http://127.0.0.1:8092"
```
```powershell
$env:PB_EMAIL = Read-Host "E-mail superuser"
```
```powershell
$env:PB_PASSWORD = Lire-Secret "Mot de passe superuser"
```
```powershell
node importer-donnees.mjs --appliquer --depuis-zero
```
- La première commande est une **simulation hors ligne** : lire le résumé.
- Avec `--appliquer`, les comptes (`users`) sont importés en premier, puis les autres entités. Chaque enregistrement garde son identifiant d'origine. Si le script est interrompu, le relancer **sans** `--depuis-zero` : il reprend où il s'était arrêté.

**4b. Comparaison des comptages** (🪟 PC, lecture seule) : `comparer-comptages.mjs` compare `C:\Export-Base44\counts.json` au nombre d'enregistrements de chaque collection. Il n'accepte que `127.0.0.1` ou `localhost`, ne fait qu'une connexion puis des lectures, et n'affiche jamais le mot de passe. Il réutilise `PB_URL`, `PB_EMAIL` et `PB_PASSWORD` définis en 4a.
```powershell
cd "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration"
```
```powershell
node pocketbase/scripts/comparer-comptages.mjs
```
- Il affiche un tableau entité / export / PocketBase / écart / état.
- Code de sortie : 0 si tout est identique, 1 s'il y a un écart ou une collection absente, 2 en cas d'erreur.
- **Écarts attendus**, à lire et non à corriger :
  - `User` : +N, les comptes de test recréés à l'étape 3 ;
  - `BibleVerse` : positif si des versets ont été ajoutés après l'export.
- Tout autre écart (`Conversation`, `Message`, `MemberProfile`, `Video`, `MusicTrack`, `UserNotification`…) est à comprendre avant de continuer.
- Autre fichier de comptages : `--counts <fichier>`.

**Mots de passe** : Base44 ne les exporte pas. Chaque compte reçoit un mot de passe **aléatoire, inconnu de tous**. Pour son propre compte admin, définir un mot de passe dans le tableau de bord (fiche de l'utilisateur). Aucun e-mail n'est envoyé aux membres pendant la répétition.

- **Risque** : moyen, la base est réécrite.
- **Annulation** : restaurer `avant-repetition-….zip` (étape 2a).

## Étape 5. Bible malgache : Jaona 8

**État au 9 novembre 2026** : la traduction malgache a 1 188 chapitres sur 1 189. **Jaona (Jean) 8 est introuvable à la source** : la source publique (`back.baiboly.antonionavira.mg`) répond **HTTP 500** pour ce chapitre (essayé deux fois). C'est sans doute aussi pourquoi Base44 ne l'avait pas. **À traiter après le basculement** (voir `A-FAIRE-APRES-BASCULEMENT.md`) : la répétition et le jour J se font avec 1 188 chapitres.

Pendant la répétition, on peut seulement vérifier l'état, sans rien écrire :
```powershell
cd "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration"
```
```powershell
node pocketbase/scripts/importer-baiboly.mjs
```
Attendu : simulation hors ligne, 1 chapitre manquant (Jaona 8).

Le jour où la source répond de nouveau (ou si le chapitre est obtenu autrement) :
```powershell
node pocketbase/scripts/importer-baiboly.mjs --telecharger --autoriser-post
```
```powershell
$env:PB_SU_EMAIL = Read-Host "E-mail superuser"
```
```powershell
$env:PB_SU_PASSWORD = Lire-Secret "Mot de passe superuser"
```
```powershell
node pocketbase/scripts/importer-baiboly.mjs --appliquer --pb http://127.0.0.1:8092
```
- `--telecharger` télécharge le chapitre depuis la source publique (pas depuis Base44) et le met en cache.
- `--appliquer` insère les versets : le rapport `baiboly-rapport.md` doit indiquer **1 189 / 1 189**, et la traduction passe en `ready`.
- **Risque** : faible. Le script ne fait qu'ajouter des versets, sans jamais en modifier ni supprimer, et ne crée pas de doublon.
- **Annulation** : supprimer les versets de ce chapitre dans `BibleVerse`.

## Étape 6. Migration des fichiers vers PocketBase et R2

- **But** : environ 62 fichiers vers `Fichier` / `FichierAdmin`, et la vidéo de 1,87 Go vers R2 ; adresses réécrites.
- **Où** : PC, par le tunnel.
- **Temps** : 10 min, plus la durée d'envoi de la vidéo (voir l'étape 0).

**6a. Le fichier `C:\Secrets-Chay\r2-migration.env`**, à créer soi-même, **hors du dépôt**, avec les clés du bucket des **vidéos**. Une ligne `NOM=valeur` par variable. Ne jamais écrire ses valeurs ailleurs, ni les afficher.

| Variable | Contenu |
|---|---|
| `R2_ENDPOINT` | point d'accès https du compte R2 |
| `R2_BUCKET` | doit valoir `chay-videos` |
| `R2_ACCESS_KEY_ID` | identifiant de la clé |
| `R2_SECRET_ACCESS_KEY` | secret de la clé |
| `R2_PUBLIC_BASE_URL` | adresse publique des vidéos, la même que sur le serveur |
| `R2_REGION` | facultatif (`auto` par défaut) |

**6b. Garde-fous de `--r2-reel`.** Sans `--r2-reel`, le script n'accepte que le faux S3 local. Avec `--r2-reel`, il exige, **avant toute connexion** :
- `--appliquer` **et** `--avec-video` ;
- un fichier `--r2-env` **hors du dépôt**, avec toutes les variables (seuls les noms manquants sont cités en cas d'erreur) ;
- `R2_BUCKET` égal au bucket attendu (`chay-videos` par défaut, ou `--bucket-attendu <nom>`) ;
- un `R2_ENDPOINT` en https.

Puis, **avant tout envoi**, il affiche un résumé (PocketBase visé, nombre de fichiers et taille, dont vers R2, bucket) et demande de taper exactement :
```
ENVOYER chay-videos
```
Toute autre réponse arrête tout, sans rien envoyer.

**6c. Commandes** (🪟 PC) :
```powershell
cd "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration"
```
```powershell
$env:PB_SU_EMAIL = Read-Host "E-mail superuser"
```
```powershell
$env:PB_SU_PASSWORD = Lire-Secret "Mot de passe superuser"
```
Simulation (aucun envoi, aucune écriture) :
```powershell
node pocketbase/scripts/migrer-fichiers.mjs --pb http://127.0.0.1:8092 --base https://api.chay.fr
```
Envoi réel :
```powershell
node pocketbase/scripts/migrer-fichiers.mjs --appliquer --avec-video --r2-reel --r2-env C:\Secrets-Chay\r2-migration.env --pb http://127.0.0.1:8092 --base https://api.chay.fr
```
```powershell
Remove-Item Env:PB_SU_PASSWORD, Env:PB_SU_EMAIL
```

**Attendu** dans `migration-fichiers-rapport.md` :
- environ 62 fichiers vers `Fichier` / `FichierAdmin` ;
- **la vidéo de 1,87 Go vers R2** ;
- les adresses réécrites ;
- « Vérification : N / N adresses lisibles et identiques ».

**Relance et interruption** :
- relancé une deuxième fois, le script ne change plus rien : une vidéo déjà présente dans R2 avec la même taille n'est pas renvoyée ;
- en cas d'interruption, l'envoi en plusieurs parties est abandonné proprement (aucune part orpheline) ; relancer reprend **ce fichier depuis le début**, les fichiers déjà envoyés sont réutilisés.

- **Risque** : moyen. Les réécritures sont annulées en restaurant la sauvegarde ; l'objet R2 de la vidéo reste dans le bucket et se supprime dans Cloudflare.
- `FICHIERS_NETTOYAGE` reste à `simulation`.

## Étape 7. Vérifications après l'import

- **Où** : site, APK, tableau de bord.
- **Temps** : environ 1 h.

1. **Comptes**
   - Connexion du compte admin.
   - Le compte d'un membre importé est visible dans `users`, avec le bon rôle et `verified` repris de Base44.
2. **Messages**
   - Les conversations et messages importés s'affichent pour le compte admin.
   - Envoi d'un message de test1 vers test2, sur le site et sur l'APK : la notification arrive, sans alerte rouge pour l'expéditeur.
3. **Médias**
   - Images de profil et de publications servies par `https://api.chay.fr/api/files/…`.
   - Musiques et audio.
   - **La vidéo de 1,87 Go lue depuis R2**, avance rapide comprise, sur le web et sur l'APK.
   - Barre de lecture et bouton pause dans l'APK.
4. **Bible** : la traduction malgache s'ouvre (1 188 chapitres, Jaona 8 absent), et la concordance fonctionne.
5. **Jeux** : les scores importés s'affichent, et une nouvelle partie s'enregistre.
6. **Push**
   - Navigateur (Chrome) et Android pour test1 et test2.
   - Désactiver puis réactiver le push navigateur doit remettre `is_active` à `true`.
7. **Confidentialité** : l'extrait de console avec test-admin doit donner **0** conversation, **0** message et **0** notification hors de ses propres conversations. Le refaire avec test-membre.
8. **Journal du serveur** : la ligne `[chay] hooks chargés` (4 tâches), aucun `failed to execute`, aucune erreur en rafale dans Logs.

## Étape 8. Fin de la répétition

- **Choix** : garder cet état jusqu'au jour J, ou restaurer `avant-repetition-….zip`.
- Dans tous les cas, noter **les durées réelles** de chaque étape : elles serviront à fixer la fenêtre de coupure du jour J.
- Retirer les variables d'environnement (voir « Préparation ») et fermer le tunnel.

---

## Jour J : à l'identique et en plus

**À refaire à l'identique** :
- étape 0 (vérifications) ;
- étape 1 (export, au **dernier moment**, Base44 gelé) ;
- étape 2 (sauvegarde puis restauration de `schema-vide.zip`, et reconfiguration) ;
- étapes 4, 5 et 6 (import et comparaison des comptages, Bible, fichiers) ;
- étape 7 (vérifications).

**Propre au jour J** :
1. **Geler Base44** : annonce aux membres, puis une période de maintenance. Ce qui serait saisi dans Base44 après l'export serait perdu.
2. **Supprimer les comptes de test** et leurs contenus, comme dans `DEPLOIEMENT.md` §9. Vider `PushEnvoi`.
3. **Mots de passe** :
   - porter la durée du lien de réinitialisation à 72 h ;
   - envoyer le lien de choix de mot de passe à chaque membre importé (environ 15 aujourd'hui), en un seul lot ;
   - le script d'envoi reste **à écrire**, selon `MIGRATION-COMPTES.md` : simulation par défaut, reprise possible ;
   - remettre la durée à 30 min une semaine après.
4. **Envois réels** :
   - mettre `NOTIFICATIONS_MODE=on` dans `/etc/chay/pocketbase.env` **et** dans `/etc/chay/push.env` ;
   - puis `sudo systemctl restart pocketbase chay-push` ;
   - vérifier la ligne `mode notifications = on` dans le journal, et `"mode":"on"` dans l'état du sidecar.
5. **`FICHIERS_NETTOYAGE`** : garder `simulation` une semaine, lire le nombre de fichiers concernés dans le journal, puis passer à `actif`.
6. **Révocations** :
   - l'ancien jeton R2 `CHAY-R2-2026-11` (Cloudflare → R2 → jetons API) ;
   - les anciennes clés du compte de service Firebase (Google Cloud → IAM → Comptes de service → Clés) ;
   - restreindre la clé d'API Firebase à `io.chay.app` ;
   - **avant chaque révocation**, vérifier que la production utilise bien la **nouvelle** clé.
7. **Fin des accès d'export** : supprimer `exportData` et `EXPORT_SECRET` dans Base44, si ce n'est pas déjà fait.
8. **Distribution** : nouvelle APK (versionCode supérieur) et annonce de l'adresse `membres.chay.fr`. Les membres doivent réactiver le push navigateur : l'ancienne clé VAPID de Base44 n'est plus valable, mais l'app se réabonne d'elle-même si l'autorisation est déjà donnée.

## Pièges connus

| Piège | Parade |
|---|---|
| La restauration de `schema-vide.zip` remet les réglages et les superusers du 7 novembre | étape 2c : mot de passe de l'époque, `configurer-production.mjs`, vérification de Backups |
| `importer-baiboly.mjs` et `migrer-fichiers.mjs` lisent `PB_SU_EMAIL` / `PB_SU_PASSWORD`, pas `PB_EMAIL` / `PB_PASSWORD` ; sans elles, ils prennent les identifiants du bac à sable | les définir avant ces deux scripts (voir « Préparation ») |
| Les e-mails d'authentification partent même en mode `test` | aucun « mot de passe oublié » pour un vrai membre avant le jour J |
| Les objets R2 survivent à une restauration de la base | les supprimer à la main dans Cloudflare |
| Un export « repris » saute les entités déjà terminées | étape 1a : mettre l'ancien export de côté |
| Mauvais bucket dans `r2-migration.env` (par exemple celui des sauvegardes) | refusé par `--r2-reel` : le bucket doit être `chay-videos` ; relire le résumé avant de taper la confirmation |
| Jaona 8 introuvable à la source (HTTP 500) | basculer avec 1 188 chapitres ; à traiter après le basculement |
| Les anciens jetons Android (APK Base44) et abonnements navigateur sont périmés | nettoyés automatiquement à chaque envoi, et plus d'alerte rouge depuis `95b57672` |
| Le SMTP actuel est OVH (`ssl0.ovh.net`), alors que `MIGRATION-COMPTES.md` recommande un prestataire d'envoi transactionnel avec SPF / DKIM / DMARC | vérifier les enregistrements DNS de `chay.fr` avant l'envoi des mots de passe |
| La durée d'envoi de 1,87 Go | mesurer le débit montant à l'étape 0 |
| Pas de sauvegarde R2 du jour | la vérifier à l'étape 0 ; sinon faire une sauvegarde manuelle (2a) |

## Décisions à prendre (responsable technique ou pasteur)

- **Dates et heures** de la répétition et du jour J, et la durée de gel de Base44.
- **Accepter de modifier Base44** pour le nouvel export : déployer la fonction `exportData` et ajouter le secret, puis les retirer.
- **Base de départ** : `schema-vide.zip` (recommandé) ou `apres-import-1.zip`.
- **Prestataire d'envoi** des e-mails de mot de passe (OVH ou prestataire transactionnel), et le **texte** de l'e-mail.
- **L'annonce** aux membres, et le moment du passage à `NOTIFICATIONS_MODE=on`.
- **Le sort de Base44** après le basculement (garder en lecture seule, ou fermer), et la **distribution de l'APK** (fichier direct ou Play Store).
- **Jaona 8** : réessayer la source plus tard, l'interroger par petites plages de versets, ou saisir le chapitre depuis une autre édition du Baiboly 1865.

## Ce qui se fait sans impact sur Base44

Déjà fait (9 novembre 2026) :
- l'option `--r2-reel` de `migrer-fichiers.mjs`, testée sur le faux S3 (commit `8800dfab`) ;
- le comparateur de comptages `comparer-comptages.mjs`, testé dans le bac à sable (même commit) ;
- la tentative de téléchargement de Jaona 8 (HTTP 500 à la source).

Encore possible dès maintenant :
- l'étape 0 en entier (disque, sauvegarde du jour, débit montant, état des fichiers d'environnement) ;
- **écrire le script d'envoi des mots de passe** (simulation par défaut) et le tester dans le bac à sable avec le faux SMTP ;
- **vérifier SPF / DKIM / DMARC** pour `chay.fr` ;
- **faire une sauvegarde manuelle** de la production (étape 2a) ;
- **répéter les étapes 4 à 7 dans le bac à sable** avec l'export actuel.
