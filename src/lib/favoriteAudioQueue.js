import { groupMusicFavorites } from "./favoritePlaylists.js";

/**
 * File de lecture de « Votre Playlist » : EXACTEMENT l'ordre affiché (groupMusicFavorites, champ `order`
 * choisi par le membre), et non plus l'ancien regroupement par playlist d'origine (playlist_order).
 */
export function buildFavoriteAudioQueue(playlist, selectedFavoriteId) {
  const tracks = groupMusicFavorites(playlist)[0].items
    .filter((favorite) => favorite.audio_url)
    .map((favorite) => ({
      id: favorite.track_id,
      queueId: favorite.id,
      title: favorite.title,
      artist: favorite.artist,
      audio_url: favorite.audio_url,
      cover_url: favorite.cover_url,
      mediaType: "music",
      playlist_id: favorite.source_playlist_id, // texte qui défile (playlist d'origine)
      origine: "favoris", // lecture non-stop (fondu enchaîné) : seulement pour Votre Playlist
      // Toucher la notification de lecture : « Votre Playlist », sur ce titre.
      route: `/media?cat=playlist&favori=${encodeURIComponent(favorite.id)}`,
      // Compteur de vues : le même titre que dans sa playlist d'origine.
      vue: { type: "piste", id: favorite.track_id },
    }));

  return {
    tracks,
    startIndex: tracks.findIndex((track) => track.queueId === selectedFavoriteId),
  };
}
