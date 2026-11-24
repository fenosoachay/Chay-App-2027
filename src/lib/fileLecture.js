// File de lecture audio (AudioPlayerContext) : nouvel ordre appliqué PENDANT la lecture, sans couper le titre.

/** Identité d'un élément de file : queueId (favoris) sinon id (pistes des playlists). */
export const cleFile = (t) => String((t && (t.queueId || t.id)) ?? "");

/**
 * Nouvel ordre `pistes` pour la file en cours. Renvoie { queue, order, orderIndex } ou null si la file en
 * cours n'est pas cette liste (autre playlist, titre seul…) : on n'y touche pas.
 *  - lecture normale : la file suit exactement le nouvel ordre ; l'index pointe toujours le titre en cours ;
 *  - aléatoire : la séquence aléatoire déjà tirée est gardée (seuls les index sont recalculés).
 */
export function reordonnerFile({ queue, order, currentTrack, shuffle }, pistes) {
  const liste = (pistes || []).filter((t) => t?.audio_url);
  if (!currentTrack || !Array.isArray(queue) || !queue.length || liste.length !== queue.length) return null;
  const nouvelles = new Map(liste.map((t, i) => [cleFile(t), i]));
  if (nouvelles.size !== liste.length) return null;
  if (!queue.every((t) => nouvelles.has(cleFile(t)))) return null;
  const courant = nouvelles.get(cleFile(currentTrack));
  if (courant === undefined) return null;
  // Les objets de la file actuelle sont gardés (même titre en cours = aucune relance de la lecture).
  const parCle = new Map(queue.map((t) => [cleFile(t), t]));
  const nouvelleFile = liste.map((t) => parCle.get(cleFile(t)));
  if (shuffle && Array.isArray(order) && order.length === queue.length) {
    const ord = order.map((i) => nouvelles.get(cleFile(queue[i])));
    return { queue: nouvelleFile, order: ord, orderIndex: Math.max(0, ord.indexOf(courant)) };
  }
  return { queue: nouvelleFile, order: nouvelleFile.map((_, i) => i), orderIndex: courant };
}

/**
 * File d'une playlist (Musique, Prédication) dans l'ordre AFFICHÉ (`pistes` = lignes PlaylistTrack triées) :
 * mêmes éléments et mêmes index que la liste des titres audio affichés.
 */
export function filePlaylist(pistes, category) {
  return (pistes || [])
    .filter((a) => a && a.audio_url)
    .map((a) => ({
      id: a.track_id,
      title: a.title,
      artist: a.artist,
      audio_url: a.audio_url,
      cover_url: a.cover_url,
      mediaType: category === "sermons" ? "sermons" : "music",
      playlist_id: a.playlist_id, // texte qui défile sur la photo du lecteur (src/lib/texteDefilant.js)
      // Toucher la notification de lecture : ce titre, dans sa playlist.
      route: routeTitre(category === "sermons" ? "sermons" : "music", a.playlist_id, a.track_id),
      // Compteur de vues (src/lib/vues.js) : +1 à la moitié de l'écoute.
      vue: { type: "piste", id: a.track_id },
    }));
}

/** Écran d'un titre dans sa playlist (Musique / Prédication). */
export function routeTitre(cat, playlistId, trackId) {
  const q = encodeURIComponent;
  return `/media?cat=${cat}${playlistId ? `&playlist=${q(playlistId)}` : ""}${trackId ? `&track=${q(trackId)}` : ""}`;
}
