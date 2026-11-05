export function buildFavoriteAudioQueue(playlist, selectedFavoriteId) {
  const tracks = (playlist || [])
    .filter((favorite) =>
      (favorite.category || "music") === "music" &&
      favorite.kind !== "video" &&
      favorite.audio_url
    )
    .sort((a, b) =>
      (a.playlist_order ?? 99999) - (b.playlist_order ?? 99999) ||
      (a.order ?? 99999) - (b.order ?? 99999)
    )
    .map((favorite) => ({
      id: favorite.track_id,
      queueId: favorite.id,
      title: favorite.title,
      artist: favorite.artist,
      audio_url: favorite.audio_url,
      cover_url: favorite.cover_url,
      mediaType: "music",
    }));

  return {
    tracks,
    startIndex: tracks.findIndex((track) => track.queueId === selectedFavoriteId),
  };
}
