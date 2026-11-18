// Playlists dans toutes les sections : Section > Playlist > Sous-playlist > contenus (un seul niveau).
// Playlist.parent_id vide = playlist de section ; sinon = sous-playlist de cette playlist.
// Un contenu est « rangé » quand un PlaylistTrack le relie (track_id) à une SOUS-playlist de sa section.

/** Entité admin -> catégorie de playlist (Playlist.category). */
export const CATEGORIE_PLAYLIST = {
  MusicTrack: "music",
  Sermon: "sermons",
  Video: "films",
  YouTubeVideo: "youtube",
  Article: "articles",
  GalleryImage: "gallery",
};

/** Sections où tout contenu doit être rangé dans une sous-playlist (formulaire admin + alerte). */
export const SECTIONS_RANGEES = [
  { entite: "MusicTrack", categorie: "music", label: "Musique" },
  { entite: "Sermon", categorie: "sermons", label: "Prédication" },
  { entite: "YouTubeVideo", categorie: "youtube", label: "YouTube" },
  { entite: "Article", categorie: "articles", label: "Articles" },
  { entite: "GalleryImage", categorie: "gallery", label: "Galerie" },
];

export const exigeSousPlaylist = (entite) => SECTIONS_RANGEES.some((s) => s.entite === entite);

export const MESSAGE_SOUS_PLAYLIST =
  "Choisissez la sous-playlist où ranger ce contenu (Playlist › Sous-playlist). " +
  "S'il n'y en a pas encore, créez d'abord une playlist puis une sous-playlist avec les boutons au-dessus de la liste.";

const parOrdre = (a, b) =>
  (a.order ?? 99999) - (b.order ?? 99999) ||
  new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime();

const categorieDe = (p) => p?.category || "music";
export const estSousPlaylist = (p) => Boolean(p && p.parent_id);

/**
 * Arbre d'une section : playlists de premier niveau (triées par `order`), chacune avec `sous` (triées).
 * Une sous-playlist dont le parent est absent ou d'une autre section est ignorée.
 */
export function arbrePlaylists(playlists, categorie) {
  const liste = (Array.isArray(playlists) ? playlists : []).filter((p) => p && categorieDe(p) === categorie);
  const racines = liste.filter((p) => !p.parent_id).sort(parOrdre);
  const ids = new Set(racines.map((p) => p.id));
  return racines.map((p) => ({
    ...p,
    sous: liste.filter((s) => s.parent_id === p.id && ids.has(s.parent_id)).sort(parOrdre),
  }));
}

/** Options du champ obligatoire « Sous-playlist » : « Playlist › Sous-playlist ». */
export function optionsSousPlaylists(arbre) {
  return (arbre || []).flatMap((p) => (p.sous || []).map((s) => ({ value: s.id, label: `${p.name} › ${s.name}` })));
}

/** Identifiants des sous-playlists valides d'une section. */
export const idsSousPlaylists = (arbre) => new Set((arbre || []).flatMap((p) => (p.sous || []).map((s) => s.id)));

/** Liens (PlaylistTrack) d'une playlist, dans l'ordre choisi par l'admin. */
export function liensDe(playlistId, playlistTracks) {
  return (Array.isArray(playlistTracks) ? playlistTracks : [])
    .filter((t) => t && t.playlist_id === playlistId)
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));
}

/** Playlist ou sous-playlist actuelle d'un contenu (pour pré-remplir le formulaire en modification), sinon "". */
export function playlistDe(contenuId, playlistTracks, arbre) {
  const valides = idsSousPlaylists(arbre);
  // Cherche d'abord un lien vers une sous-playlist
  let lien = (playlistTracks || []).find((t) => t.track_id === contenuId && valides.has(t.playlist_id));
  if (lien) return lien.playlist_id;
  // Sinon, cherche un lien vers une playlist de premier niveau (sans parent_id)
  const toutesPlaylists = new Set((arbre || []).flatMap((p) => [p.id, ...(p.sous || []).map((s) => s.id)]));
  lien = (playlistTracks || []).find((t) => t.track_id === contenuId && toutesPlaylists.has(t.playlist_id) && !valides.has(t.playlist_id));
  return lien ? lien.playlist_id : "";
}

/** Alias pour compatibilité : retourne la sous-playlist seulement (pour l'admin existant). */
export function sousPlaylistDe(contenuId, playlistTracks, arbre) {
  const valides = idsSousPlaylists(arbre);
  const lien = (playlistTracks || []).find((t) => t.track_id === contenuId && valides.has(t.playlist_id));
  return lien ? lien.playlist_id : "";
}

/** Contenus d'une section qui ne sont dans AUCUNE sous-playlist de cette section (à ranger). */
export function contenusNonRanges(contenus, playlistTracks, arbre) {
  const valides = idsSousPlaylists(arbre);
  const ranges = new Set((playlistTracks || []).filter((t) => valides.has(t.playlist_id)).map((t) => t.track_id));
  return (Array.isArray(contenus) ? contenus : []).filter((c) => c && !ranges.has(c.id));
}

/** Contenus d'une sous-playlist, dans l'ordre des liens ; les contenus introuvables sont ignorés. */
export function contenusDe(playlistId, playlistTracks, contenus) {
  const parId = new Map((contenus || []).map((c) => [c.id, c]));
  return liensDe(playlistId, playlistTracks).map((t) => parId.get(t.track_id)).filter(Boolean);
}

/** Options pour le sélecteur unique : playlists de 1er niveau ET sous-playlists hiérarchisées.
 *  Format : { value: "id", label: "Playlist A" } ou { value: "id", label: "Playlist A › Sous-playlist 1" }
 *  Le champ playlist_id reste obligatoire pour la playlist, facultatif pour la sous-playlist. */
export function optionsPlaylistEtSousPlaylists(arbre) {
  return (arbre || []).flatMap((p) => [
    { value: p.id, label: p.name },
    ...(p.sous || []).map((s) => ({ value: s.id, label: `${p.name} › ${s.name}` }))
  ]);
}
