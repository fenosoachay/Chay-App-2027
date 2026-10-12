import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

import PullToRefresh from "@/components/PullToRefresh";
import CategoryGrid from "@/components/media/CategoryGrid";
import MediaCategory from "@/components/media/MediaCategory";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { useRadio } from "@/lib/RadioContext";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { filterVisible } from "@/lib/mediaConstants";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { Loader2 } from "lucide-react";
import { loadYoutubeListWithCache } from "@/lib/youtubeListCache";

export default function Media() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentTrack, isPlaying, play, playQueue, toggle } = useAudioPlayer();
  const radio = useRadio();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeCat = searchParams.get("cat");
  const targetTrackId = searchParams.get("track");
  const targetPlaylistId = searchParams.get("playlist");
  const targetVideoId = searchParams.get("video");
  const targetArticleId = searchParams.get("article");
  const targetImageId = searchParams.get("image");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [tracks, setTracks] = useState([]);
  const [sermons, setSermons] = useState([]);
  const [videos, setVideos] = useState([]);
  const [articles, setArticles] = useState([]);
  const [youtube, setYoutube] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistTracks, setPlaylistTracks] = useState([]);


  const loadAll = async () => {
    const [
      t, s, v, a, y, g, p, pl, pt,
      targetTracks, targetVideos, targetArticles, targetImages,
    ] = await Promise.all([
      base44.entities.MusicTrack.list("-created_date", 30).catch(() => []),
      base44.entities.Sermon.list("-date", 30).catch(() => []),
      base44.entities.Video.list("-created_date", 30).catch(() => []),
      base44.entities.Article.list("-created_date", 20).catch(() => []),
      loadYoutubeListWithCache(() => base44.entities.YouTubeVideo.list("-created_date")),
      base44.entities.GalleryImage.list("-created_date", 30).catch(() => []),
      base44.entities.PlaylistItem.list("-created_date", 50).catch(() => []),
      base44.entities.Playlist.list("-created_date", 50).catch(() => []),
      base44.entities.PlaylistTrack.list("-created_date", 200).catch(() => []),
      targetTrackId
        ? base44.entities.PlaylistTrack.filter({ track_id: targetTrackId }, "-created_date", 50).catch(() => [])
        : Promise.resolve([]),
      targetVideoId
        ? base44.entities.YouTubeVideo.filter({ id: targetVideoId }, "-created_date", 1).catch(() => [])
        : Promise.resolve([]),
      targetArticleId
        ? base44.entities.Article.filter({ id: targetArticleId }, "-created_date", 1).catch(() => [])
        : Promise.resolve([]),
      targetImageId
        ? base44.entities.GalleryImage.filter({ id: targetImageId }, "-created_date", 1).catch(() => [])
        : Promise.resolve([]),
    ]);
    const mergeById = (list, extras) => {
      const merged = new Map((Array.isArray(list) ? list : []).map((item) => [item.id, item]));
      (Array.isArray(extras) ? extras : []).forEach((item) => merged.set(item.id, item));
      return [...merged.values()];
    };
    const targetPlaylistIdForTrack =
      targetPlaylistId || (Array.isArray(targetTracks) ? targetTracks[0]?.playlist_id : null);
    const extraPlaylists =
      targetPlaylistIdForTrack && !(Array.isArray(pl) ? pl : []).some((item) => item.id === targetPlaylistIdForTrack)
        ? await base44.entities.Playlist.filter(
            { id: targetPlaylistIdForTrack },
            "-created_date",
            1
          ).catch(() => [])
        : [];
    setTracks(Array.isArray(t) ? t : []);
    setSermons(Array.isArray(s) ? s : []);
    setVideos(Array.isArray(v) ? v : []);
    setArticles(mergeById(a, targetArticles));
    setYoutube(mergeById(y, targetVideos));
    setGallery(filterVisible(mergeById(g, targetImages), user));
    setPlaylist(Array.isArray(p) ? p : []);
    setPlaylists(mergeById(pl, extraPlaylists));
    setPlaylistTracks(mergeById(pt, targetTracks));
  };

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const addToPlaylist = async (item, category) => {
    try {
      if (category !== "music" || !item.source_playlist_id) return;
      if (playlist.some((p) =>
        p.track_id === item.id && p.source_playlist_id === item.source_playlist_id
      )) {
        toast({ title: "Déjà dans cette playlist de favoris" });
        return;
      }
      const samePlaylistItems = playlist.filter(
        (p) => p.source_playlist_id === item.source_playlist_id
      );
      const nextTrackOrder = samePlaylistItems.length
        ? Math.max(...samePlaylistItems.map((p) => p.order ?? -1)) + 1
        : 0;
      const nextPlaylistOrder = samePlaylistItems.length
        ? Math.min(...samePlaylistItems.map((p) => p.playlist_order ?? 99999))
        : playlist.reduce((max, p) => Math.max(max, (p.playlist_order ?? -1) + 1), 0);
      await base44.entities.PlaylistItem.create({
        track_id: item.id,
        title: item.title,
        artist: item.artist || null,
        audio_url: item.audio_url || null,
        video_url: item.video_url || null,
        cover_url: item.cover_url || null,
        kind: item.kind || "audio",
        category: "music",
        source_playlist_id: item.source_playlist_id,
        source_playlist_name: item.source_playlist_name,
        order: nextTrackOrder,
        playlist_order: nextPlaylistOrder,
      });
      toast({ title: `Ajouté aux favoris : ${item.source_playlist_name || "playlist"}` });
      await loadAll();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const removeFromPlaylist = async (id) => {
    await base44.entities.PlaylistItem.delete(id).catch(() => {});
    setPlaylist((p) => p.filter((i) => i.id !== id));
  };

  const playPlaylistItem = (item) => {
    if (currentTrack?.id === item.track_id) {
      toggle();
      return;
    }
    play({
      id: item.track_id,
      title: item.title,
      artist: item.artist,
      audio_url: item.audio_url,
      cover_url: item.cover_url,
      mediaType: item.category === "sermons" ? "sermons" : "music",
    });
  };

  const isPinned = (id, sourcePlaylistId) =>
    playlist.some((p) => p.track_id === id && p.source_playlist_id === sourcePlaylistId);

  const reorderFavoriteItems = async (sourcePlaylistId, nextItems) => {
    const orders = new Map(nextItems.map((item, index) => [item.id, index]));
    const updates = nextItems.map((item) => ({
      ...item,
      order: orders.get(item.id),
    }));
    setPlaylist((current) => current.map((item) => {
      const key = item.source_playlist_id || "legacy-favorites";
      return key === sourcePlaylistId ? { ...item, order: orders.get(item.id) ?? item.order } : item;
    }));
    const results = await Promise.all(updates.map((item) =>
      base44.entities.PlaylistItem.update(item.id, { order: item.order }).then(() => true, () => false)
    ));
    if (results.includes(false)) {
      toast({ title: "Réorganisation non enregistrée", variant: "destructive" });
      await loadAll();
    }
  };

  const reorderFavoritePlaylists = async (nextGroups) => {
    const orderById = new Map(nextGroups.map((group, index) => [group.id, index]));
    const updates = playlist
      .filter((item) => orderById.has(item.source_playlist_id || "legacy-favorites"))
      .map((item) => ({
        id: item.id,
        playlist_order: orderById.get(item.source_playlist_id || "legacy-favorites"),
      }));
    setPlaylist((current) => current.map((item) => {
      const key = item.source_playlist_id || "legacy-favorites";
      return orderById.has(key) ? { ...item, playlist_order: orderById.get(key) } : item;
    }));
    const results = await Promise.all(updates.map((item) =>
      base44.entities.PlaylistItem.update(item.id, { playlist_order: item.playlist_order }).then(() => true, () => false)
    ));
    if (results.includes(false)) {
      toast({ title: "Réorganisation non enregistrée", variant: "destructive" });
      await loadAll();
    }
  };

  const openCat = (id) =>
    setSearchParams({ cat: id }, { state: { chayMediaCategory: true } });
  const back = () => {
    if (hasNavigationOrigin(window.history.state, "chayMediaCategory")) navigate(-1);
    else setSearchParams({}, { replace: true });
  };

  return (
    <PullToRefresh mode="window" onRefresh={loadAll}>
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-12">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        {!activeCat && (
          <div>
            <h1 className="display-fluid">
              <span className="brand-gradient-text">Multimédia</span>
            </h1>
            <p className="mt-3 text-base md:text-lg text-foreground/60">
              Musique, prédications, films, articles et plus encore.
            </p>
          </div>
        )}
      </header>

      {loading && activeCat !== "radio" ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : activeCat ? (
        <MediaCategory
          cat={activeCat}
          data={{ tracks, sermons, videos, articles, youtube, gallery, playlist }}
          query={query}
          setQuery={setQuery}
          onBack={back}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          play={play}
          playQueue={playQueue}
          toggle={toggle}
          addToPlaylist={addToPlaylist}
          removeFromPlaylist={removeFromPlaylist}
          playPlaylistItem={playPlaylistItem}
          isPinned={isPinned}
          onReorderFavoriteItems={reorderFavoriteItems}
          onReorderFavoritePlaylists={reorderFavoritePlaylists}
          playlists={playlists}
          playlistTracks={playlistTracks}
          onGalleryItemUpdated={(updated) =>
            setGallery((items) => items.map((item) => item.id === updated.id ? updated : item))
          }
          onGalleryItemDeleted={(imageId) =>
            setGallery((items) => items.filter((item) => item.id !== imageId))
          }
        />
      ) : (
        <CategoryGrid
          onOpen={openCat}
          radioPlaying={radio.isPlaying}
          onToggleRadio={() => radio.toggle()}
          isAdmin={user?.role === "admin"}
        />
      )}

    </div>
    </PullToRefresh>
  );
}