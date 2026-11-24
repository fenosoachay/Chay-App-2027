#!/usr/bin/env bash
# Installe les hooks envoyés dans /tmp/chay/pb_hooks (scp depuis le PC) à la place de /opt/pocketbase/pb_hooks,
# puis redémarre PocketBase (voir docs/DEPLOIEMENT.md § 2 et § 6). Aucun secret ici.
# L'ancien dossier est gardé à côté (pb_hooks.avant-<date>) pour un retour arrière :
#   sudo rm -rf /opt/pocketbase/pb_hooks && sudo mv /opt/pocketbase/pb_hooks.avant-<date> /opt/pocketbase/pb_hooks
#   sudo systemctl restart pocketbase
# Usage (sur le serveur) : sudo bash /tmp/chay/installer-hooks.sh
set -euo pipefail

SOURCE=/tmp/chay/pb_hooks
CIBLE=/opt/pocketbase/pb_hooks

[ "$(id -u)" -eq 0 ] || { echo "A lancer avec sudo."; exit 1; }
[ -f "$SOURCE/scores.pb.js" ] && [ -d "$SOURCE/lib" ] || { echo "Hooks absents de $SOURCE : refaire le scp."; exit 1; }

chmod -R u=rwX,go=rX /tmp/chay
if [ -d "$CIBLE" ]; then
  AVANT="$CIBLE.avant-$(date +%Y%m%d-%H%M)"
  mv "$CIBLE" "$AVANT"
  echo "Ancien dossier garde : $AVANT"
fi
mkdir -p "$CIBLE"
cp -a "$SOURCE/." "$CIBLE/"
chown -R root:root "$CIBLE"
chmod -R u=rwX,go=rX "$CIBLE"
systemctl restart pocketbase
sleep 3
if systemctl is-active --quiet pocketbase; then
  echo "HOOKS_OK : PocketBase redemarre."
else
  echo "ATTENTION : PocketBase ne tourne pas. Journal :"
  journalctl -u pocketbase -n 30 --no-pager
  exit 1
fi
