export function isValidPlaylistImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function formatListenCount(count) {
  const num = Number(count);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num === 1 ? "1 écoute" : `${num} écoutes`;
}

// ── Sous-playlists : contrôle de l'enregistrement (1.3.9) ─────────────────────────────────────────────
// Cause du bug « sélecteur de sous-playlist vide » : sans le champ Playlist.parent_id (migration
// pocketbase/scripts/migrer-playlists.mjs non appliquée), PocketBase IGNORE ce champ sans erreur ; la
// « sous-playlist » est enregistrée comme une playlist de premier niveau et le sélecteur n'a rien à proposer.

export const MESSAGE_SCHEMA_PLAYLISTS =
  "Le serveur n'enregistre pas le rattachement des sous-playlists (champ « parent_id » absent de la collection " +
  "Playlist). Appliquez la migration pocketbase/scripts/migrer-playlists.mjs (docs/PLAYLISTS-SECTIONS.md), puis réessayez.";

const norm = (v) => (v === null || v === undefined ? "" : String(v));

/**
 * La playlist relue garde-t-elle le rattachement et la section envoyés ? Renvoie null si oui, sinon le nom du
 * champ perdu (« parent_id » ou « category »).
 */
export function champPerdu(envoye, enregistre) {
  if (!enregistre) return "parent_id";
  if (norm(envoye?.parent_id) !== norm(enregistre.parent_id)) return "parent_id";
  if (envoye?.category && norm(envoye.category) !== norm(enregistre.category)) return "category";
  return null;
}

/** Playlists lues sans aucune clé « parent_id » : le champ n'existe pas sur le serveur. */
export function schemaSansSousPlaylists(playlists) {
  const l = Array.isArray(playlists) ? playlists.filter(Boolean) : [];
  return l.length > 0 && l.every((p) => !Object.prototype.hasOwnProperty.call(p, "parent_id"));
}
