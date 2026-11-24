import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import PlaylistCategoryView from "@/components/media/PlaylistCategoryView";

// Chay Enfants › Vidéos (1.3.26) : exactement comme Multimédia › Vidéo (playlists, sous-playlists, affiches ou
// défilement vertical, lecture, compteur de vues), avec les vidéos de Admin › Chay Kids › Vidéos (VideoEnfant),
// rangées dans les playlists de la catégorie « enfants ».
export default function VideosEnfants() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { currentTrack, isPlaying, playQueue, toggle } = useAudioPlayer();
  const [playlists, setPlaylists] = useState(null);
  const [pistes, setPistes] = useState([]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const pl = await base44.entities.Playlist.filter({ category: "enfants" }, "-created_date", 500).catch(() => []);
      const liste = Array.isArray(pl) ? pl : [];
      const ids = liste.map((p) => p.id);
      const pt = ids.length
        ? await base44.entities.PlaylistTrack.filter({ playlist_id: { $in: ids } }, "-created_date", 5000).catch(() => [])
        : [];
      if (!vivant) return;
      setPistes(Array.isArray(pt) ? pt : []);
      setPlaylists(liste);
    })();
    return () => { vivant = false; };
  }, []);

  if (playlists === null) {
    return <div className="grid h-40 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  return (
    <PlaylistCategoryView
      category="enfants"
      kind="video"
      favoriteCategory="enfants"
      intro="Choisis une playlist, puis une vidéo."
      playlists={playlists}
      playlistTracks={pistes}
      currentTrack={currentTrack}
      isPlaying={isPlaying}
      playQueue={playQueue}
      toggle={toggle}
      isAdmin={isAdmin}
    />
  );
}
