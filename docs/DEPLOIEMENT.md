# Mise en service sur le serveur (Phase 6)

Procédure **à suivre à la main**, une commande à la fois. Rien n'a été exécuté sur le serveur.

Repères :
- 🪟 **PC** = Windows PowerShell, dans le dossier `C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration`.
- 🐧 **SERVEUR** = session SSH sur le serveur Ubuntu (`ssh utilisateur@serveur`).
- Chaque étape a son **retour arrière** juste en dessous.
- Ne jamais coller un secret dans une commande : les secrets vont dans des fichiers `600`, ouverts avec `sudo nano`.

Chemins supposés (à confirmer à l'étape 0) :

| Élément | Chemin |
|---|---|
| Binaire PocketBase | `/opt/pocketbase/pocketbase` |
| Données | `/opt/pocketbase/pb_data` |
| Hooks | `/opt/pocketbase/pb_hooks` |
| Service | `pocketbase` (systemd) |

---

## 0. Préparation

🪟 **PC** : mémoriser l'adresse du serveur pour la session PowerShell.
```powershell
$SERVEUR = "utilisateur@adresse-du-serveur"
ssh $SERVEUR "echo connexion ok"
```

🐧 **SERVEUR** : repérer l'installation réelle.
```bash
systemctl cat pocketbase
/opt/pocketbase/pocketbase --version
df -h /opt
```

Si les chemins diffèrent, remplacer `/opt/pocketbase` partout dans ce document. La version doit être **0.40.6**, comme le bac à sable.

---

## 1. Sauvegarde complète de pb_data (avant tout)

🐧 **SERVEUR**
```bash
sudo mkdir -p /root/sauvegardes
sudo systemctl stop pocketbase
sudo tar -czf /root/sauvegardes/pb_data-avant-phase6-$(date +%F-%H%M).tar.gz -C /opt/pocketbase pb_data pb_hooks
sudo systemctl start pocketbase
sudo ls -lh /root/sauvegardes/
```

L'arrêt dure quelques secondes : il évite de copier la base pendant une écriture.

🪟 **PC** : garder une copie hors du serveur.
```powershell
New-Item -ItemType Directory -Force C:\Sauvegardes-Chay | Out-Null
ssh $SERVEUR "sudo cp /root/sauvegardes/pb_data-avant-phase6-*.tar.gz /tmp/ && sudo chown `$USER /tmp/pb_data-avant-phase6-*.tar.gz"
scp "${SERVEUR}:/tmp/pb_data-avant-phase6-*.tar.gz" C:\Sauvegardes-Chay\
ssh $SERVEUR "rm /tmp/pb_data-avant-phase6-*.tar.gz"
```

⚠️ Cette archive contient toutes les données des membres : la garder sur un disque chiffré (BitLocker), ne jamais la partager.

**Retour arrière (restaurer cette sauvegarde)**, 🐧 **SERVEUR** :
```bash
sudo systemctl stop pocketbase
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.echec-$(date +%F-%H%M)
sudo mv /opt/pocketbase/pb_hooks /opt/pocketbase/pb_hooks.echec-$(date +%F-%H%M)
sudo tar -xzf /root/sauvegardes/pb_data-avant-phase6-AAAA-MM-JJ-HHMM.tar.gz -C /opt/pocketbase
sudo systemctl start pocketbase
```

---

## 2. Copier les hooks et le sidecar sur le serveur

🪟 **PC** (Windows a `scp`, pas `rsync`) :
```powershell
git checkout migration-pocketbase
git pull
ssh $SERVEUR "rm -rf /tmp/chay && mkdir -p /tmp/chay"
scp -r pocketbase\pb_hooks "${SERVEUR}:/tmp/chay/pb_hooks"
scp -r pocketbase\sidecar-push "${SERVEUR}:/tmp/chay/sidecar-push"
```

🐧 **SERVEUR** : remplacer les hooks en gardant les anciens.
```bash
sudo cp -a /opt/pocketbase/pb_hooks /opt/pocketbase/pb_hooks.avant-phase6
sudo rsync -a --delete /tmp/chay/pb_hooks/ /opt/pocketbase/pb_hooks/
sudo chown -R root:root /opt/pocketbase/pb_hooks
ls /opt/pocketbase/pb_hooks /opt/pocketbase/pb_hooks/lib
```

Les nouveaux hooks ne sont lus qu'au redémarrage (étape 6).

**Retour arrière**
```bash
sudo rsync -a --delete /opt/pocketbase/pb_hooks.avant-phase6/ /opt/pocketbase/pb_hooks/
sudo systemctl restart pocketbase
```

---

## 3. Appliquer le schéma (import avec fusion)

L'import passe par le tableau d'administration, à travers un **tunnel SSH**. Le tableau `/_/` n'a pas à être exposé (voir § Durcissement). Il ne touche ni aux collections système (`_superusers`, `users`…) ni aux données.

🪟 **PC** : ouvrir le tunnel dans une fenêtre PowerShell à part et la laisser ouverte. Arrêter d'abord le PocketBase du bac à sable s'il tourne : il utilise le port 8090.
```powershell
ssh -N -L 8090:127.0.0.1:8090 $SERVEUR
```

Puis, dans le navigateur du PC : `http://127.0.0.1:8090/_/` → connexion superuser.

**3a. Collections**, dans le tableau d'administration :
1. Settings → **Import collections** ;
2. charger `C:\Export-Base44\_outil\pb\collections.json` ;
3. **ne pas** cocher la suppression des collections ou champs absents (« Delete missing… ») ;
4. **lire l'écran de comparaison** : seules des collections de l'app doivent apparaître, jamais une collection système ni une suppression ;
5. confirmer.

Changements attendus depuis le premier import :
- nouvelles collections : `Fichier`, `FichierAdmin`, `PushEnvoi` ;
- règles modifiées : `UploadSession`, `UploadChunk` (fermées), `Conversation`, `Message` (participants seulement), et les collections corrigées aux blocs 2 et 3 (voir `regles.md`).

**3b. Collection `users`** (champs et règles), 🪟 **PC**, dans une nouvelle fenêtre, le tunnel restant ouvert :
```powershell
cd C:\Export-Base44\_outil\pb
$env:PB_URL = "http://127.0.0.1:8090"
$env:PB_EMAIL = Read-Host "E-mail superuser"
$env:PB_PASSWORD = Read-Host "Mot de passe superuser"
node apply-users.mjs
node apply-users.mjs --appliquer
Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL
```

La première commande est une simulation : la lire avant de lancer `--appliquer`.

**3c. Réglages** (tableau d'administration, à la main ; le script du bac à sable n'accepte que le SMTP local) :

| Réglage | Valeur |
|---|---|
| Settings → Application → **Application URL** | `https://membres.chay.fr` |
| Settings → Mail settings | SMTP du fournisseur, expéditeur `noreply@…` |
| Settings → Rate limits | règles de `pocketbase/config/settings-bac-a-sable.json` (section `rateLimits`) |
| Settings → Application → **Trusted proxy** | en-tête `X-Forwarded-For` (voir § Durcissement) |
| Collections → users → Options | OTP, modèles d'e-mail, durées : `pocketbase/config/users-auth.json` |

**Retour arrière** : restaurer la sauvegarde de l'étape 1. Le schéma et les données reviennent ensemble ; c'est la seule méthode sûre.

---

## 4. Installer le sidecar push

🐧 **SERVEUR** : Node 20 ou plus est nécessaire.
```bash
node -v
```

Si la commande est absente ou affiche une version inférieure à 20 :
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource.sh
less /tmp/nodesource.sh
sudo bash /tmp/nodesource.sh
sudo apt-get install -y nodejs
```

Le `less` sert à lire le script avant de le lancer.

Utilisateur dédié, sans connexion, et fichiers du sidecar :
```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin chay-push
sudo mkdir -p /opt/chay/sidecar-push /etc/chay
sudo cp /tmp/chay/sidecar-push/serveur.mjs /tmp/chay/sidecar-push/crypto-push.mjs /opt/chay/sidecar-push/
sudo chown -R root:root /opt/chay && sudo chmod 755 /opt/chay /opt/chay/sidecar-push && sudo chmod 644 /opt/chay/sidecar-push/*
```

Fichier d'environnement (600, root). Les valeurs sont **tapées dans l'éditeur**, jamais dans une commande :
```bash
sudo install -m 600 -o root -g root /dev/null /etc/chay/push.env
sudo nano /etc/chay/push.env
```

Contenu (noms seulement, voir `docs/VARIABLES-PRODUCTION.md`) :
```
PUSH_SIDECAR_SECRET=
PUSH_PORT=8091
FIREBASE_SERVICE_ACCOUNT=/etc/chay/firebase-sa.json
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:
```

Pour générer le secret partagé (il servira aussi à l'étape 5), sur le serveur :
```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Compte de service Firebase. Le fichier JSON téléchargé depuis la console Firebase se copie depuis le 🪟 **PC** :
```powershell
scp C:\chemin\vers\compte-de-service.json "${SERVEUR}:/tmp/firebase-sa.json"
```
🐧 **SERVEUR**
```bash
sudo install -m 640 -o root -g chay-push /tmp/firebase-sa.json /etc/chay/firebase-sa.json
shred -u /tmp/firebase-sa.json
```

Service systemd :
```bash
sudo cp /tmp/chay/sidecar-push/chay-push.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chay-push
sudo systemctl status chay-push --no-pager
sudo journalctl -u chay-push -n 20 --no-pager
```

Le journal doit afficher `à l'écoute sur 127.0.0.1:8091 {"fcm":"configuré","web":"configuré","localOnly":false}`. Si `web` affiche `vapid_key_mismatch`, la clé privée ne correspond pas à la clé publique de l'app.

**Retour arrière**
```bash
sudo systemctl disable --now chay-push
```

Sans le sidecar, l'app fonctionne ; seul le push manque (`push_not_configured`).

---

## 5. Variables d'environnement de PocketBase

🐧 **SERVEUR**
```bash
sudo install -m 600 -o root -g root /dev/null /etc/chay/pocketbase.env
sudo nano /etc/chay/pocketbase.env
```

Contenu (noms seulement ; valeurs dans `docs/VARIABLES-PRODUCTION.md`) :
```
R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_REGION=auto
R2_PUBLIC_BASE_URL=
R2_PREFIX=videos
CHAY_PUBLIC_URL=https://api.chay.fr
PUSH_SIDECAR_URL=http://127.0.0.1:8091
PUSH_SIDECAR_SECRET=
```

`PUSH_SIDECAR_SECRET` doit être **la même valeur** que dans `/etc/chay/push.env`. Les clés R2 sont **les nouvelles**, créées après la révocation de l'ancien jeton.

Brancher ce fichier sur le service :
```bash
sudo systemctl edit pocketbase
```

Dans l'éditeur, entre les deux lignes de commentaire indiquées, écrire :
```
[Service]
EnvironmentFile=/etc/chay/pocketbase.env
```

**Retour arrière**
```bash
sudo systemctl revert pocketbase
sudo systemctl restart pocketbase
```

---

## 6. Redémarrage et vérifications de santé

🐧 **SERVEUR**
```bash
sudo systemctl daemon-reload
sudo systemctl restart pocketbase
sudo systemctl status pocketbase --no-pager
sudo journalctl -u pocketbase -n 50 --no-pager
```

Aucune erreur JavaScript ne doit apparaître : une erreur de hook s'affiche au démarrage.

🐧 **SERVEUR** : le sidecar répond en local. Le secret est lu dans le fichier, jamais affiché :
```bash
sudo bash -c 'set -a; . /etc/chay/push.env; curl -s -H "X-Chay-Push-Secret: $PUSH_SIDECAR_SECRET" http://127.0.0.1:8091/etat'; echo
sudo ss -ltnp | grep -E ':8090|:8091'
```

Résultats attendus :
- `{"fcm":"configured","web":"configured","localOnly":false}` ;
- deux lignes, **toutes deux sur `127.0.0.1`**, jamais `0.0.0.0` ni `*`.

🪟 **PC** : vérifications depuis l'extérieur.
```powershell
curl.exe -s https://api.chay.fr/api/health
Test-NetConnection api.chay.fr -Port 8091
foreach ($f in "sendFcmPush","createMessage","notifyNewContent","createCommunityPost","upload_chunk","createThemeRequest") { "$f : " + (curl.exe -s -o NUL -w "%{http_code}" -X POST "https://api.chay.fr/api/fn/$f") }
```

Résultats attendus :
- la santé répond `"API is healthy."` ;
- le port 8091 répond `TcpTestSucceeded : False` ;
- chaque route répond `401` ou `403`. Un `404` signifie que les hooks ne sont pas chargés.

Tâches planifiées, via le tunnel de l'étape 3 : tableau d'administration → Settings → **Crons**. On doit y voir `push_reessais`, `verset_du_jour`, `televersements_incomplets` et `fichiers_orphelins`.

**Retour arrière** : étapes 2, 4 et 5 (hooks, sidecar, variables), ou sauvegarde de l'étape 1.

---

## 7. Site web `membres.chay.fr` (Caddy)

⚠️ **`app.chay.fr` est l'ancienne application PHP de l'église, toujours en service : ne pas toucher à son bloc Caddy ni à son DNS.** La nouvelle app web est servie sur **`https://membres.chay.fr`**, avec un bloc séparé.

> **CORS** : PocketBase et R2 doivent autoriser l'origine **`https://membres.chay.fr`**.
> - PocketBase : `--origins=https://membres.chay.fr,https://localhost` (point 4 ci-dessous ; `https://localhost` = APK Android).
> - R2, bucket `chay-videos` → Settings → CORS policy : `AllowedOrigins` = `https://membres.chay.fr`, `https://localhost`, `capacitor://localhost` ; méthodes `PUT`, `GET`, `HEAD` ; `ExposeHeaders` = `ETag` (voir `docs/FICHIERS.md`).
>
> Sans ces deux réglages, les appels à l'API et l'envoi des vidéos échouent dans le navigateur, avec une erreur CORS dans la console.

1. **DNS** : enregistrement `A` (et `AAAA` si IPv6) `membres.chay.fr` vers l'adresse du serveur.

2. 🪟 **PC** : construire le site et l'envoyer.
```powershell
$env:VITE_BACKEND = "pocketbase"; $env:VITE_PB_URL = "https://api.chay.fr"; $env:VITE_PUBLIC_APP_URL = "https://membres.chay.fr"
npx vite build --outDir C:\Temp\chay-dist --emptyOutDir
Remove-Item Env:VITE_BACKEND, Env:VITE_PB_URL, Env:VITE_PUBLIC_APP_URL
ssh $SERVEUR "rm -rf /tmp/chay-dist && mkdir -p /tmp/chay-dist"
scp -r C:\Temp\chay-dist\* "${SERVEUR}:/tmp/chay-dist/"
```

Le build va dans `C:\Temp\chay-dist` et non dans `dist\` : une partie de `dist\` est suivie par git.

3. 🐧 **SERVEUR** : mettre le site en place.
```bash
sudo mkdir -p /srv/chay-app
[ -d /srv/chay-app/dist ] && sudo mv /srv/chay-app/dist /srv/chay-app/dist.precedent-$(date +%F-%H%M)
sudo cp -a /tmp/chay-dist /srv/chay-app/dist
sudo chown -R root:root /srv/chay-app/dist && sudo chmod -R a+rX /srv/chay-app/dist
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.avant-app
sudo nano /etc/caddy/Caddyfile
```

Ajouter le bloc `membres.chay.fr { … }` de `docs/CADDY-APP.md`, puis :
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -sI https://membres.chay.fr | head -5
curl -s -o /dev/null -w "%{http_code}\n" https://membres.chay.fr/messages
```

Résultats attendus : `200` et `strict-transport-security` dans les en-têtes, puis `200` pour `/messages` (retour à l'application monopage).

4. Origines autorisées par PocketBase : ajouter `--origins=https://membres.chay.fr,https://localhost` à la ligne `ExecStart` (`sudo systemctl edit --full pocketbase`), puis `sudo systemctl restart pocketbase`.

**Retour arrière**
```bash
sudo cp /etc/caddy/Caddyfile.avant-app /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Pour revenir à la version précédente du site, remettre `dist.precedent-…` à la place de `dist`.

---

## 8. Vérifications avec de vrais comptes de test

Créer **deux comptes de test dédiés** :
- `test-admin@<domaine>`, à passer en `role = admin` dans le tableau d'administration ;
- `test-membre@<domaine>`.

Utiliser de vraies boîtes e-mail que tu consultes. Ne jamais utiliser le compte d'un membre.

| # | Vérification | Où | Attendu |
|---|---|---|---|
| 1 | Inscription de `test-membre` | membres.chay.fr | e-mail avec code reçu (regarder aussi les indésirables), code accepté |
| 2 | Connexion, déconnexion, mot de passe oublié | membres.chay.fr + APK | e-mail de réinitialisation reçu, lien vers `membres.chay.fr` |
| 3 | Push navigateur | Réglages → Notifications → Activer, puis « Tester » | notification affichée |
| 4 | Push Android | APK installé, notifications autorisées, « Tester le push Android » | notification affichée **app fermée** et au premier plan ; le clic ouvre la bonne page |
| 5 | Message entre les deux comptes | Messages | push et e-mail chez le destinataire ; pas d'e-mail en double dans les 30 min |
| 6 | Image ≤ 15 Mo (membre) | Communauté → publication avec photo | image affichée ; adresse en `https://api.chay.fr/api/files/…` |
| 7 | Fichier 15 à 100 Mo (admin) | Admin → contenu audio | envoi par morceaux terminé, lecture OK |
| 8 | Vidéo > 100 Mo (admin) | Admin → vidéo | envoi direct vers R2 ; lecture depuis `https://media.chay.fr/videos/…` |
| 9 | Conversations privées | `test-admin` ouvre Messages | il ne voit **que** ses conversations |
| 10 | Prière | `test-membre` crée, `test-admin` prend en charge | push « Quelqu'un prie pour toi » |
| 11 | Verset du jour | le lendemain à 07:00 (heure de Paris) | notification si un dévotionnel est planifié |
| 12 | Liens partagés depuis l'APK | verset, radio | adresse en `https://membres.chay.fr/…` |

---

## 9. Remettre les données au propre avant le basculement

1. **Supprimer les comptes de test** par l'app, avec leurs données :
   - `test-membre` : Réglages → zone de danger → supprimer mon compte (route `deleteMyAccount`) ;
   - `test-admin` : depuis un autre admin, ou en le repassant d'abord en `role = user`. La suppression du **dernier administrateur** est refusée.
   
   Ces routes suppriment ou anonymisent les données liées (voir `docs/SUPPRESSION-COMPTE.md`).
2. **Ce que la suppression de compte ne retire pas**, à supprimer dans le tableau d'administration :
   - publications de test (`CommunityPost`) ;
   - contenus admin de test (`Content`, `MusicTrack`, `Video`…) ;
   - leurs fichiers (`Fichier` / `FichierAdmin`, filtre `proprietaire = "<id du compte de test>"`) ;
   - la vidéo de test dans R2 (Cloudflare → bucket → `videos/…`).
3. **File push** : Collections → `PushEnvoi` doit être vide (sinon tout supprimer).
4. **Nettoyage des fichiers orphelins** : tableau d'administration → Settings → Crons → lancer `fichiers_orphelins`. C'est une simulation par défaut ; la route `cleanupOrphanFiles` applique.
5. **Sauvegarde** « propre » juste avant le basculement (étape 1, avec un autre nom de fichier).

---

## 10. Durcissement (avant le basculement)

**Mises à jour de sécurité automatiques**, 🐧 **SERVEUR** :
```bash
sudo apt-get update && sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Pare-feu** : seuls SSH, HTTP et HTTPS sont ouverts.
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**fail2ban** (protection de SSH) :
```bash
sudo apt-get install -y fail2ban
sudo bash -c 'printf "[sshd]\nenabled = true\nmaxretry = 5\nbantime = 1h\n" > /etc/fail2ban/jail.d/sshd.local'
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Conseillé aussi : connexion SSH **par clé seulement** (`PasswordAuthentication no` dans `/etc/ssh/sshd_config`), **après** avoir vérifié que la clé fonctionne.

**MFA du superuser** : tableau d'administration → Collections → `_superusers` → Options → **MFA** activé, avec OTP par e-mail. Tester la connexion avec un second onglet avant de fermer le premier.

**Restreindre `/_/`** (tableau d'administration) : ne plus l'exposer sur Internet et passer par le tunnel SSH de l'étape 3. Dans le bloc Caddy de `api.chay.fr` :
```caddyfile
@admin path /_/*
respond @admin 404
```
Puis `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

**Limites de débit** : Settings → Rate limits activé, avec les règles de `pocketbase/config/settings-bac-a-sable.json`.

**Trusted proxy** : Settings → Application → *User IP proxy headers* = `X-Forwarded-For`, *Use leftmost IP* activé. Sans ce réglage, tous les membres partagent le même compteur de limites (IP de Caddy).

**Sauvegardes chiffrées hors serveur (R2)** :
1. Dans PocketBase : Settings → Backups → sauvegarde automatique quotidienne (`0 3 * * *`), en gardant les 7 dernières. Elles vont dans `pb_data/backups`.
2. Copie chiffrée vers un **bucket R2 distinct** (par exemple `chay-sauvegardes`), avec un jeton R2 limité à ce bucket et `restic` (chiffrement de bout en bout) :
```bash
sudo apt-get install -y restic
sudo install -m 600 -o root -g root /dev/null /etc/chay/restic.env
sudo nano /etc/chay/restic.env
```
   Contenu (valeurs tapées dans l'éditeur) :
```
RESTIC_REPOSITORY=s3:https://<compte>.r2.cloudflarestorage.com/chay-sauvegardes
RESTIC_PASSWORD=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```
   **`RESTIC_PASSWORD` est à conserver aussi hors du serveur** (gestionnaire de mots de passe) : sans lui, les sauvegardes sont illisibles.
```bash
sudo bash -c 'set -a; . /etc/chay/restic.env; restic init'
sudo bash -c 'set -a; . /etc/chay/restic.env; restic backup /opt/pocketbase/pb_data/backups'
sudo bash -c 'echo "30 4 * * * root bash -c '"'"'set -a; . /etc/chay/restic.env; restic backup -q /opt/pocketbase/pb_data/backups && restic forget -q --keep-daily 14 --keep-weekly 8 --prune'"'"'" > /etc/cron.d/chay-sauvegarde'
```

**Test de restauration** (à faire une fois, puis chaque trimestre), 🐧 **SERVEUR** :
```bash
sudo bash -c 'set -a; . /etc/chay/restic.env; restic snapshots'
sudo bash -c 'set -a; . /etc/chay/restic.env; restic restore latest --target /tmp/test-restauration'
sudo ls /tmp/test-restauration/opt/pocketbase/pb_data/backups/
mkdir -p /tmp/pb-test && sudo unzip -q /tmp/test-restauration/opt/pocketbase/pb_data/backups/<dernier>.zip -d /tmp/pb-test
sudo /opt/pocketbase/pocketbase serve --http=127.0.0.1:8099 --dir=/tmp/pb-test
```

Dans un second terminal SSH :
```bash
curl -s "http://127.0.0.1:8099/api/collections/BibleVerse/records?perPage=1&fields=id" | head -c 200
```

On doit obtenir une réponse avec `totalItems`. Ensuite, arrêter avec `Ctrl+C` et supprimer les copies : `sudo rm -rf /tmp/test-restauration /tmp/pb-test`.

---

## Plus tard (jour du basculement)

Hors de cette mise en service, à préparer à part :
- migration des fichiers (`pocketbase/scripts/migrer-fichiers.mjs`, à ouvrir au serveur réel) ;
- import de la Bible malgache (`importer-baiboly.mjs`, depuis le cache) ;
- build de l'APK (correctif Android déjà appliqué) ;
- bascule de l'app vers `VITE_BACKEND=pocketbase`.
