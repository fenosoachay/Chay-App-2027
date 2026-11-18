export function isValidPlaylistImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function formatListenCount(count) {
  const num = Number(count);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num === 1 ? "1 écoute" : `${num} écoutes`;
}

// ── Sous-playlists : détection de schéma sans parent_id (1.3.9) ────────────────────────────────────────────

/** Playlists lues sans aucune clé « parent_id » : le champ est caché (« Hidden ») ou n'existe pas sur le serveur. */
export function schemaSansSousPlaylists(playlists) {
  const l = Array.isArray(playlists) ? playlists.filter(Boolean) : [];
  return l.length > 0 && l.every((p) => !Object.prototype.hasOwnProperty.call(p, "parent_id"));
}

export const MESSAGE_SOUS_PLAYLIST =
  "Le champ « parent_id » de la collection Playlist est absent ou caché (option « Hidden »). " +
  "Les sous-playlists ne peuvent pas être listées. Appliquez la migration pocketbase/scripts/migrer-1-3-9.mjs.";
