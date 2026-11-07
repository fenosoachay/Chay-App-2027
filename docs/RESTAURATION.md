# Restaurer PocketBase (production)

Ce document décrit trois procédures, **à suivre à la main**, une commande à la fois :
- **A** : restauration complète depuis le tableau d'administration (sauvegarde sur R2) ;
- **B** : restauration en secours en ligne de commande, avec le zip ;
- **C** : serveur perdu, reconstruction sur un VPS neuf.

Repères, comme dans `DEPLOIEMENT.md` :
- 🪟 **PC** = Windows PowerShell ;
- 🐧 **SERVEUR** = session SSH sur Ubuntu.

Aucun secret n'est tapé dans une commande, et aucune étape n'utilise `nano`.

## Comment les sauvegardes sont faites aujourd'hui

C'est **PocketBase lui-même** qui sauvegarde (Settings → Backups). Il n'y a pas d'autre outil.

| Réglage | Valeur |
|---|---|
| Fréquence | chaque nuit, cron `0 3 * * *` en **UTC**, soit 4 h à Paris l'hiver et 5 h l'été |
| Conservation | les **7** dernières sauvegardes automatiques (`@auto_…`). Les sauvegardes faites à la main ne sont pas supprimées automatiquement. |
| Stockage | S3 : bucket R2 **`chay-sauvegardes`**, juridiction **UE**, point d'accès `https://<compte>.eu.r2.cloudflarestorage.com`, région `auto` |
| Accès | jeton R2 **limité à ce bucket** : ses clés sont dans les réglages S3 de PocketBase |
| Copie locale | aucune : avec le stockage S3, `pb_data/backups` n'est pas utilisé |

⚠️ **Une sauvegarde contient les réglages de PocketBase en clair** : le mot de passe SMTP de `no-reply@chay.fr` et les clés S3 du bucket des sauvegardes. Elle contient aussi toutes les données des membres. Donc :
- le bucket `chay-sauvegardes` reste **privé** : pas de domaine public, pas d'accès `r2.dev` ;
- une sauvegarde ne se **partage jamais** : pas de lien, pas de pièce jointe, pas de copie dans le dépôt ;
- une copie téléchargée reste sur un disque chiffré (BitLocker) et se supprime après usage.

## Ce que contient une sauvegarde, et ce qu'elle ne contient pas

| Dans le zip de sauvegarde PocketBase | **Pas** dans le zip (à refaire à part, voir C) |
|---|---|
| `data.db` : toutes les données, **y compris les réglages** (SMTP avec son mot de passe, sauvegardes S3 avec leurs clés, limites de débit, trusted proxy) et les superusers | `pb_hooks/` : dans le dépôt git |
| `auxiliary.db` : journaux (5 jours par défaut) | `/etc/chay/pocketbase.env`, `push.env`, `firebase-sa.json` |
| `storage/` : fichiers de `Fichier` et `FichierAdmin` (images, audio, PDF) | sidecar push (`/opt/chay/sidecar-push`, service `chay-push`) |
| `types.d.ts` | Caddy (`/etc/caddy/Caddyfile`), site web (`/srv/chay-app/dist`), service `pocketbase` |
| | **vidéos** : elles sont toutes sur R2 (bucket des vidéos), pas dans la sauvegarde |

**Restaurer, c'est revenir en arrière** : tout ce qui a été créé après l'heure de la sauvegarde est perdu (messages, comptes, fichiers). Choisir la sauvegarde la plus récente qui soit saine.

## Durées

| Opération | Durée |
|---|---|
| Test de restauration sur une instance jetable (PC, sauvegarde de 163 Mo, 7 novembre 2026) | décompression **1,7 s**, démarrage **1,2 s** ; **10 s** au total avec les vérifications |
| A : restauration depuis le tableau d'administration | **2 à 5 min** (téléchargement depuis R2, puis redémarrage) |
| B : restauration en ligne de commande | **5 à 10 min** |
| C : VPS neuf | **2 à 4 h**, plus la propagation DNS (de quelques minutes à quelques heures, selon le TTL) |

Pendant A et B, l'app est **indisponible** une à quelques minutes.

---

## 0. Avant toute restauration (A ou B)

🐧 **SERVEUR** : noter l'état actuel. Il servira à comparer après la restauration.
```bash
sudo systemctl status pocketbase --no-pager
sudo journalctl -u pocketbase -b --no-pager | grep -F -e "[chay] hooks chargés" -e "failed to execute"
sudo du -sh /opt/pocketbase/pb_data/data.db /opt/pocketbase/pb_data/auxiliary.db /opt/pocketbase/pb_data/storage
df -h /opt
curl -s http://127.0.0.1:8090/api/health; echo
```

🐧 **SERVEUR** : copie de sécurité de l'état actuel. Elle permet de revenir en arrière si la restauration se passe mal.
```bash
sudo mkdir -p /root/sauvegardes
sudo systemctl stop pocketbase
sudo tar -czf /root/sauvegardes/pb_data-avant-restauration-$(date +%F-%H%M).tar.gz -C /opt/pocketbase pb_data
sudo systemctl start pocketbase
sudo ls -lh /root/sauvegardes/
```

Il faut au moins **deux fois** la taille de `pb_data` d'espace libre : la copie de sécurité, plus le zip restauré. Cette copie contient elle aussi des secrets : elle reste dans `/root` (lisible par root seulement).

🪟 **PC** : ouvrir le tunnel vers le tableau d'administration (laisser cette fenêtre ouverte).
```powershell
ssh -N -L 8092:127.0.0.1:8090 $SERVEUR
```

Dans le tableau d'administration (`http://127.0.0.1:8092/_/`), noter : le nombre de comptes dans `users`, le nombre de collections, et Settings → Crons (4 tâches de l'app + 6 tâches `__pb…`).

---

## A. Restauration depuis le tableau d'administration (sauvegarde sur R2)

1. Faire l'étape 0.
2. `http://127.0.0.1:8092/_/` → **Settings → Backups**. La liste vient du bucket `chay-sauvegardes`.
3. Repérer la sauvegarde voulue (nom `@auto_…` avec date, taille). Une taille anormale signale un problème : par exemple 155 Mo au lieu de 10 Mo à cause de vidéos stockées dans PocketBase.
4. Optionnel mais conseillé : bouton **Download**, puis tester le zip sur une instance jetable (voir « Tester un zip sans risque » plus bas).
5. Bouton **Restore** de cette sauvegarde, puis taper le nom demandé pour confirmer.
6. PocketBase télécharge le zip depuis R2, remplace `pb_data`, puis **redémarre tout seul** (systemd le relance). La page se recharge. Si elle reste blanche plus de 2 minutes, passer à la vérification ci-dessous.
7. Se reconnecter : le superuser et son mot de passe sont ceux **de la sauvegarde**.

🐧 **SERVEUR** : vérifications après restauration.
```bash
sudo systemctl status pocketbase --no-pager
sudo journalctl -u pocketbase --since "10 min ago" --no-pager | grep -F -e "[chay] hooks chargés" -e "failed to execute" -e "Server started"
curl -s http://127.0.0.1:8090/api/health; echo
sudo du -sh /opt/pocketbase/pb_data/data.db /opt/pocketbase/pb_data/storage
```

Résultats attendus :
- `active (running)` ;
- une ligne `[chay] hooks chargés : 4 tâches planifiées (…), mode notifications = …`, avec le mode **actuel** (il vient de `/etc/chay/pocketbase.env`, que la restauration ne touche pas) ;
- aucune ligne `failed to execute` ;
- `API is healthy`.

Dans le tableau d'administration :
- `users` : le nombre de comptes attendu **à la date de la sauvegarde** ;
- Settings → Crons : 4 + 6 tâches ;
- Settings → Backups : toujours sur S3, bucket `chay-sauvegardes`, cron `0 3 * * *`, 7 conservées ;
- Settings → Mail settings → **Send test email** à votre adresse ;
- Logs : pas d'erreur en rafale.

🪟 **PC** : depuis l'extérieur.
```powershell
curl.exe -s https://api.chay.fr/api/health
curl.exe -s -o NUL -w "%{http_code}`n" -X POST https://api.chay.fr/api/fn/createMessage
curl.exe -s -o NUL -w "%{http_code}`n" https://membres.chay.fr/messages
```
Attendus, dans l'ordre : `API is healthy`, `401`, `200`.

Enfin, avec un compte de test dans l'app : connexion, lecture d'une image et d'une vidéo (sur R2), envoi d'un message.

**Retour arrière** (remettre l'état noté à l'étape 0) : procédure B, avec le fichier `/root/sauvegardes/pb_data-avant-restauration-….tar.gz`. Remplacer l'étape « unzip » par `sudo tar -xzf /root/sauvegardes/pb_data-avant-restauration-AAAA-MM-JJ-HHMM.tar.gz -C /opt/pocketbase`.

---

## B. Restauration en secours, en ligne de commande (avec le zip)

À utiliser si le tableau d'administration est inaccessible, ou si PocketBase ne démarre plus.

**Récupérer le zip** (sur le 🪟 **PC**) :
1. Tableau de bord Cloudflare → R2 → bucket **`chay-sauvegardes`** → choisir l'objet `@auto_…zip` → **Download**.
2. Le ranger dans `C:\Sauvegardes-Chay\` (disque chiffré), puis l'envoyer au serveur :
```powershell
scp "C:\Sauvegardes-Chay\NOM-DE-LA-SAUVEGARDE.zip" "${SERVEUR}:/tmp/restauration.zip"
```

🐧 **SERVEUR** : faire l'étape 0, puis contrôler le zip.
```bash
sudo chmod 600 /tmp/restauration.zip
sudo unzip -l /tmp/restauration.zip | tail -1
sudo unzip -l /tmp/restauration.zip | grep -E " (data\.db|auxiliary\.db)$"
```
Le zip doit contenir `data.db` et `auxiliary.db` **à sa racine**.

🐧 **SERVEUR** : remplacement, dans **une seule** session (les variables `D` et `O` servent jusqu'à la fin).
```bash
D=$(date +%F-%H%M)
O=$(sudo stat -c %U:%G /opt/pocketbase/pb_data)
echo "propriétaire : $O ; ancien dossier : /opt/pocketbase/pb_data.remplace-$D"
sudo systemctl stop pocketbase
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.remplace-$D
sudo mkdir /opt/pocketbase/pb_data
sudo unzip -q /tmp/restauration.zip -d /opt/pocketbase/pb_data
sudo chown -R "$O" /opt/pocketbase/pb_data
sudo systemctl start pocketbase
sudo shred -u /tmp/restauration.zip
```

Le dossier restauré reprend le même propriétaire qu'avant (`$O`). Le zip est effacé du serveur à la fin.

Puis les **mêmes vérifications** qu'en A (serveur, tableau d'administration, PC, app).

**Retour arrière** (même session) : remettre le dossier précédent.
```bash
sudo systemctl stop pocketbase
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.echec-$(date +%F-%H%M)
sudo mv /opt/pocketbase/pb_data.remplace-$D /opt/pocketbase/pb_data
sudo systemctl start pocketbase
```

Une fois tout validé (quelques jours plus tard), supprimer `pb_data.remplace-…` et `pb_data.echec-…`, qui contiennent des données personnelles et des secrets.

---

## Tester un zip sans risque (avant une vraie restauration)

Sur le 🪟 **PC**, une instance **jetable** démarre sur une copie : `pocketbase/tests/pb-jetable.mjs` avec l'option `dataDir`. Elle utilise un dossier temporaire et un port libre, jamais 8090 ni 8092, et ne crée pas de lien d'installation. Précautions, car la copie contient les **réglages de production** :
- démarrer avec `NOTIFICATIONS_MODE=off` et des variables vides pour `PUSH_SIDECAR_*` et `R2_*` : aucun push, aucun e-mail de notification ;
- **ne pas se connecter en superuser** par l'API ou le tableau d'administration : l'alerte de nouvelle connexion partirait par le **vrai SMTP**. Vérifier par comptage direct dans `data.db` (lecture seule), sans jamais lire la table `_params` ;
- arrêter l'instance avant 3 h UTC : la sauvegarde automatique écrirait sinon dans le **vrai** bucket `chay-sauvegardes` (les réglages S3 sont dans la copie) ;
- supprimer le dossier temporaire à la fin.

Résultat du test du 7 novembre 2026 (`test_r2.zip`, 163 Mo) :

| Vérification | Résultat |
|---|---|
| Restauration et démarrage | 1,7 s + 1,2 s |
| Collections | 68 |
| Comptes `users` | 19 (4 admin, 15 user) |
| Ligne de démarrage | 4 tâches planifiées, mode `off` |
| Stockage | 4 fichiers (et 4 fichiers `.attrs`) de `FichierAdmin`, 146,3 Mo, tous lus en entier ; un fichier servi par PocketBase (HTTP 200) |
| Vidéos de test | 2 MP4 de 68,6 et 65,2 Mo dans `FichierAdmin` (envoyés avant la règle « toutes les vidéos sur R2 ») : 134 Mo des 146 Mo |

---

## C. Serveur perdu : repartir sur un VPS neuf

### Ce qu'il faut racheter ou retrouver

| Élément | Où |
|---|---|
| **VPS** Ubuntu 24.04, 2 Go de RAM ou plus, 40 Go de disque ou plus | hébergeur, seul achat |
| Nom de domaine, DNS | inchangés : on change seulement l'adresse IP |
| Bucket R2 des vidéos, bucket R2 `chay-sauvegardes` | Cloudflare : intacts |
| Firebase (projet MonEglise-App), boîte e-mail OVH `no-reply@chay.fr` | intacts |
| Jeton R2 du bucket `chay-sauvegardes` (pour relire les sauvegardes) | gestionnaire de mots de passe, ou nouveau jeton limité à ce bucket dans Cloudflare |
| Clés R2 du bucket des vidéos | gestionnaire de mots de passe, ou nouveau jeton dans Cloudflare |
| Clé privée VAPID | `C:\Secrets-Chay\` : la **même** clé, sinon les abonnements push navigateur cessent de fonctionner |
| Compte de service Firebase (JSON) | gestionnaire, ou nouvelle clé dans la console Firebase (puis supprimer l'ancienne) |
| `PUSH_SIDECAR_SECRET` | aucun besoin de l'ancien : en générer un nouveau, mis dans les deux fichiers |
| Mot de passe SMTP, superuser, réglages S3 des sauvegardes | **compris dans la sauvegarde** |
| Hooks, sidecar, site web | dépôt git, branche `migration-pocketbase` |

### C1. Préparer le DNS (dès que possible)

Chez le gestionnaire DNS : baisser le TTL de `api.chay.fr` et `membres.chay.fr` à 300 s. Les enregistrements `A` (et `AAAA`) seront changés en C8.

Si l'ancienne application PHP `app.chay.fr` était sur ce serveur, elle a sa propre procédure : ne pas toucher à son enregistrement DNS ici.

### C2. Système de base

🐧 **SERVEUR** (nouveau VPS, connecté avec l'utilisateur fourni par l'hébergeur) :
```bash
sudo apt-get update
sudo apt-get -y upgrade
sudo apt-get install -y unzip curl fail2ban ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo bash -c 'printf "[sshd]\nenabled = true\nmaxretry = 5\nbantime = 1h\n" > /etc/fail2ban/jail.d/sshd.local'
sudo systemctl enable --now fail2ban
```

Le port 8090 (PocketBase) et le port 8091 (sidecar) **ne sont pas ouverts** : ils n'écoutent que sur 127.0.0.1.

### C3. PocketBase 0.40.6

🐧 **SERVEUR**
```bash
sudo useradd --system --home /opt/pocketbase --shell /usr/sbin/nologin pocketbase
sudo mkdir -p /opt/pocketbase/pb_data /opt/pocketbase/pb_hooks /etc/chay
sudo chown pocketbase:pocketbase /opt/pocketbase/pb_data
curl -fsSL -o /tmp/pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
curl -fsSL -o /tmp/pb-checksums.txt https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/checksums.txt
cd /tmp && grep linux_amd64.zip pb-checksums.txt | sed 's/pocketbase_0.40.6_linux_amd64.zip/pb.zip/' | sha256sum -c -
sudo unzip -o /tmp/pb.zip pocketbase -d /opt/pocketbase
/opt/pocketbase/pocketbase --version
```
La vérification `sha256sum` doit afficher `pb.zip: OK`, et la version `0.40.6`.

### C4. Hooks, sidecar, variables et services

🪟 **PC** : les hooks et le sidecar, depuis le dépôt à jour.
```powershell
git -C "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration" pull
ssh $SERVEUR "rm -rf /tmp/chay && mkdir -p /tmp/chay"
scp -r "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration\pocketbase\pb_hooks" "${SERVEUR}:/tmp/chay/pb_hooks"
scp -r "C:\Users\CHAY VERSET\Desktop\Chay-App-2027-migration\pocketbase\sidecar-push" "${SERVEUR}:/tmp/chay/sidecar-push"
```

🐧 **SERVEUR** : hooks.
```bash
sudo chmod -R u=rwX,go=rX /tmp/chay
sudo cp -a /tmp/chay/pb_hooks/. /opt/pocketbase/pb_hooks/
sudo chown -R root:root /opt/pocketbase/pb_hooks
sudo chmod -R u=rwX,go=rX /opt/pocketbase/pb_hooks
ls /opt/pocketbase/pb_hooks /opt/pocketbase/pb_hooks/lib
```

🐧 **SERVEUR** : secret partagé PocketBase et sidecar. Il est généré dans une variable, jamais affiché.
```bash
S=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
sudo install -m 600 -o root -g root /dev/null /etc/chay/pocketbase.env
sudo install -m 600 -o root -g root /dev/null /etc/chay/push.env
printf 'PUSH_SIDECAR_SECRET=%s\n' "$S" | sudo tee -a /etc/chay/pocketbase.env /etc/chay/push.env > /dev/null; unset S
```

🐧 **SERVEUR** : `pocketbase.env`. Les noms et les valeurs non secrètes sont écrits directement ; les secrets sont saisis **sans écho** (ni à l'écran, ni dans l'historique).
```bash
printf '%s\n' 'R2_REGION=auto' 'R2_PREFIX=videos' 'CHAY_PUBLIC_URL=https://api.chay.fr' 'PUSH_SIDECAR_URL=http://127.0.0.1:8091' 'NOTIFICATIONS_MODE=test' 'NOTIFICATIONS_TEST_EMAILS=' 'FICHIERS_NETTOYAGE=simulation' | sudo tee -a /etc/chay/pocketbase.env > /dev/null
for K in R2_ENDPOINT R2_BUCKET R2_PUBLIC_BASE_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do read -rsp "$K : " V && printf '%s=%s\n' "$K" "$V" | sudo tee -a /etc/chay/pocketbase.env > /dev/null; unset V; echo; done
sudo sed -E 's/=.*/=…/' /etc/chay/pocketbase.env
```
La dernière commande n'affiche que les **noms** : on vérifie qu'aucun ne manque. Les clés R2 sont celles du bucket des **vidéos**, pas celles de `chay-sauvegardes`. Le mode `test` est volontaire ; il passera à `on` comme dans `DEPLOIEMENT.md`.

🐧 **SERVEUR** : `push.env` et compte Firebase.
```bash
printf '%s\n' 'PUSH_PORT=8091' 'FIREBASE_SERVICE_ACCOUNT=/etc/chay/firebase-sa.json' 'VAPID_SUBJECT=mailto:no-reply@chay.fr' 'NOTIFICATIONS_MODE=test' | sudo tee -a /etc/chay/push.env > /dev/null
for K in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do read -rsp "$K : " V && printf '%s=%s\n' "$K" "$V" | sudo tee -a /etc/chay/push.env > /dev/null; unset V; echo; done
sudo sed -E 's/=.*/=…/' /etc/chay/push.env
```

🪟 **PC** : le compte de service Firebase.
```powershell
scp C:\chemin\vers\compte-de-service.json "${SERVEUR}:/tmp/firebase-sa.json"
```

🐧 **SERVEUR** : sidecar (Node 20 ou plus, voir l'étape 4 de `DEPLOIEMENT.md` pour l'installer).
```bash
node -v
sudo useradd --system --no-create-home --shell /usr/sbin/nologin chay-push
sudo install -m 640 -o root -g chay-push /tmp/firebase-sa.json /etc/chay/firebase-sa.json
shred -u /tmp/firebase-sa.json
sudo mkdir -p /opt/chay/sidecar-push
sudo cp /tmp/chay/sidecar-push/serveur.mjs /tmp/chay/sidecar-push/crypto-push.mjs /opt/chay/sidecar-push/
sudo chown -R root:root /opt/chay
sudo chmod 755 /opt/chay /opt/chay/sidecar-push
sudo chmod 644 /opt/chay/sidecar-push/*
sudo cp /tmp/chay/sidecar-push/chay-push.service /etc/systemd/system/
```

🐧 **SERVEUR** : service PocketBase, puis un superuser **provisoire**, qui sera remplacé par ceux de la sauvegarde.
```bash
printf '%s\n' '[Unit]' 'Description=PocketBase (Église Chay)' 'After=network.target' '' '[Service]' 'Type=simple' 'User=pocketbase' 'Group=pocketbase' 'EnvironmentFile=/etc/chay/pocketbase.env' 'ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090 --dir=/opt/pocketbase/pb_data --hooksDir=/opt/pocketbase/pb_hooks --origins=https://membres.chay.fr,https://localhost' 'Restart=always' 'RestartSec=5' 'LimitNOFILE=4096' '' '[Install]' 'WantedBy=multi-user.target' | sudo tee /etc/systemd/system/pocketbase.service > /dev/null
read -rsp 'Mot de passe du superuser provisoire : ' P && sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert provisoire@chay.fr "$P" --dir=/opt/pocketbase/pb_data; unset P; echo
sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase
sudo systemctl enable --now chay-push
sudo systemctl status pocketbase --no-pager
sudo systemctl status chay-push --no-pager
sudo ss -ltnp | grep -E ':8090|:8091'
```
Deux ports doivent apparaître, **tous deux sur 127.0.0.1**. PocketBase tourne pour l'instant **à vide**.

### C5. Restaurer la dernière sauvegarde depuis R2

🪟 **PC** : tunnel (fenêtre laissée ouverte), puis tableau d'administration.
```powershell
ssh -N -L 8092:127.0.0.1:8090 $SERVEUR
```

1. `http://127.0.0.1:8092/_/` → connexion avec le superuser provisoire.
2. **Settings → Backups** → *Storage* : **S3**, avec :
   - *Endpoint* : `https://<compte>.eu.r2.cloudflarestorage.com` (le point d'accès **UE**) ;
   - *Bucket* : `chay-sauvegardes` ;
   - *Region* : `auto` ;
   - *Access key* / *Secret* : le jeton limité à ce bucket.
3. **Test connection**, puis **Save**. La liste des sauvegardes `@auto_…` apparaît.
4. Sur la plus récente : **Restore**, puis confirmer. PocketBase redémarre avec les données, les réglages (dont le stockage S3 des sauvegardes) et les superusers **de la sauvegarde**. Le superuser provisoire disparaît.

**Secours, si le tableau ne liste rien** : télécharger le zip depuis le tableau de bord Cloudflare (bucket `chay-sauvegardes` → objet → Download), puis faire la procédure **B** sur ce serveur. L'étape 0 est inutile, puisque le serveur est vide.

🐧 **SERVEUR**
```bash
sudo journalctl -u pocketbase --since "10 min ago" --no-pager | grep -F -e "[chay] hooks chargés" -e "failed to execute"
sudo journalctl -u chay-push -n 5 --no-pager
sudo du -sh /opt/pocketbase/pb_data/data.db /opt/pocketbase/pb_data/storage
```
Attendus :
- `[chay] hooks chargés : 4 tâches planifiées (…), mode notifications = test`, et aucun `failed to execute` ;
- le sidecar `à l'écoute sur 127.0.0.1:8091 {"fcm":"configuré","web":"configuré",…,"mode":"test"}`.

### C6. Caddy et site web

🐧 **SERVEUR** : installer Caddy (dépôt officiel).
```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update
sudo apt-get install -y caddy
```

🐧 **SERVEUR** : bloc `api.chay.fr`. Le tableau `/_/` n'est **pas** exposé : on y accède par le tunnel SSH.
```bash
printf '%s\n' 'api.chay.fr {' '	@admin path /_/*' '	respond @admin 404' '	reverse_proxy 127.0.0.1:8090' '}' '' | sudo tee /etc/caddy/Caddyfile > /dev/null
```

Ajouter ensuite le bloc `membres.chay.fr { … }` de `docs/CADDY-APP.md`. Pour éviter `nano`, le copier depuis le 🪟 **PC** (`docs/CADDY-APP.md`, partie « Bloc Caddyfile ») dans un fichier `C:\Temp\membres.caddy`, puis :
```powershell
scp C:\Temp\membres.caddy "${SERVEUR}:/tmp/membres.caddy"
```
🐧 **SERVEUR**
```bash
sudo bash -c 'cat /tmp/membres.caddy >> /etc/caddy/Caddyfile'
sudo mkdir -p /var/log/caddy /srv/chay-app
sudo caddy validate --config /etc/caddy/Caddyfile
```

🪟 **PC** : site web (build de production, comme dans `DEPLOIEMENT.md` étape 7).
```powershell
ssh $SERVEUR "rm -rf /tmp/chay-dist && mkdir -p /tmp/chay-dist"
scp -r C:\Temp\chay-dist\* "${SERVEUR}:/tmp/chay-dist/"
```
🐧 **SERVEUR**
```bash
sudo cp -a /tmp/chay-dist /srv/chay-app/dist
sudo chown -R root:root /srv/chay-app/dist
sudo chmod -R a+rX /srv/chay-app/dist
```

Caddy est rechargé **après** le changement de DNS (C7) : le certificat HTTPS ne peut être obtenu que si les noms visent déjà le nouveau serveur.

### C7. DNS et mise en ligne

1. Chez le gestionnaire DNS : changer les enregistrements `A` (et `AAAA`) de `api.chay.fr` et `membres.chay.fr` vers la nouvelle adresse IP.
2. 🪟 **PC** : attendre que les noms répondent avec la nouvelle adresse.
```powershell
Resolve-DnsName api.chay.fr -Type A
Resolve-DnsName membres.chay.fr -Type A
```
3. 🐧 **SERVEUR**
```bash
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager | grep -i -e certificate -e error
curl -sI https://api.chay.fr/api/health | head -1
curl -s -o /dev/null -w "%{http_code}\n" https://membres.chay.fr/messages
```

### C8. Après la reconstruction

1. Faire les vérifications de **A** : tableau d'administration par le tunnel, PC, app.
2. Dans le tableau d'administration :
   - **Settings → Application** → *Trusted proxy* : `X-Forwarded-For`, *Use leftmost IP* **désactivé** (Caddy sur la même machine) ;
   - **Settings → Backups** : S3 `chay-sauvegardes` (point d'accès `.eu.`), cron `0 3 * * *`, 7 conservées ;
   - **Mail settings** → Send test email ;
   - **Rate limits**.
   Ces réglages viennent de la sauvegarde ; le script `pocketbase/scripts/configurer-production.mjs` remet l'application, le SMTP, les limites et le trusted proxy si besoin, en simulation d'abord.
3. Push : envoyer un message de test vers un compte listé dans `NOTIFICATIONS_TEST_EMAILS`, sur l'APK et sur le navigateur.
4. Le lendemain matin : vérifier qu'une nouvelle sauvegarde `@auto_…` est arrivée dans `chay-sauvegardes`.
5. Supprimer les restes : `sudo rm -rf /tmp/chay /tmp/chay-dist /tmp/pb.zip /tmp/membres.caddy`.
6. Remettre le TTL DNS à sa valeur normale.

---

## Améliorations à faire

- **Sauvegarde chiffrée de la configuration du serveur** (pas encore en place) : `/etc/chay` (variables et secrets), `/etc/caddy/Caddyfile`, `/etc/systemd/system/pocketbase.service` et `chay-push.service`.
  - Ces fichiers ne sont pas dans les sauvegardes PocketBase : aujourd'hui, l'étape C4 les recrée à la main.
  - Piste : `restic` (chiffrement de bout en bout) vers un bucket R2 privé distinct, avec son propre jeton et un mot de passe gardé hors du serveur.
- **Sauvegardes petites** : toutes les vidéos sur R2 (en place), journaux à 3–7 jours, contrôle de la taille des `@auto_…`. Les deux vidéos de test de 134 Mo, envoyées dans `FichierAdmin` avant la règle, peuvent être supprimées ou renvoyées vers R2.
- **Tester une restauration chaque trimestre** sur une instance jetable (section « Tester un zip sans risque »).
