import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

import PullToRefresh from "@/components/PullToRefresh";
import CategoryGrid from "@/components/media/CategoryGrid";
import MediaCategory from "@/components/media/MediaCategory";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { useRadio } from "@/lib/RadioContext";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { buildFavoriteAudioQueue } from "@/lib/favoriteAudioQueue";
import { Loader2 } from "lucide-react";
import { loadYoutubeListWithCache } from "@/lib/youtubeListCache";
import { lireMemoireMedia, ecrireMemoireMedia } from "@/lib/mediaMemoire";

export default function Media() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentTrack, isPlaying, play, playQueue, reorderQueue, toggle } = useAudioPlayer();
  const radio = useRadio();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeCat = searchParams.get("cat");
  // 1.3.28 : « Actualité chrétienne » supprimée ; un ancien lien (notification, favori) ramène au Multimédia.
  useEffect(() => {
    if (activeCat === "actualite") setSearchParams({}, { replace: true });
  }, [activeCat, setSearchParams]);
  const targetTrackId = searchParams.get("track");
  const targetPlaylistId = searchParams.get("playlist");
  const targetVideoId = searchParams.get("video");
  const targetArticleId = searchParams.get("article");
  const targetImageId = searchParams.get("image");
  // Données de la visite précédente (en mémoire, pour CE compte) : la page s'affiche tout de suite,
  // sans écran de chargement, pendant que loadAll() rafraîchit. Indicateur à la toute première visite.
  const [memoire] = useState(() => lireMemoireMedia(user?.id));
  const [loading, setLoading] = useState(() => !memoire);
  const [query, setQuery] = useState("");

  const [tracks, setTracks] = useState(() => memoire?.tracks || []);
  const [sermons, setSermons] = useState(() => memoire?.sermons || []);
  const [videos, setVideos] = useState(() => memoire?.videos || []);
  const [articles, setArticles] = useState(() => memoire?.articles || []);
  const [youtube, setYoutube] = useState(() => memoire?.youtube || []);
  const [gallery, setGallery] = useState(() => memoire?.gallery || []);
  const [playlist, setPlaylist] = useState(() => memoire?.playlist || []);
  const [playlists, setPlaylists] = useState(() => memoire?.playlists || []);
  const [playlistTracks, setPlaylistTracks] = useState(() => memoire?.playlistTracks || []);

  // Mémoire tenue à jour (chargements ET modifications locales : photo modifiée, favori retiré…).
  useEffect(() => {
    if (loading) return;
    ecrireMemoireMedia(user?.id, { tracks, sermons, videos, articles, youtube, gallery, playlist, playlists, playlistTracks });
  }, [loading, user?.id, tracks, sermons, videos, articles, youtube, gallery, playlist, playlists, playlistTracks]);


  const mergeById = (list, extras) => {
    const merged = new Map((Array.isArray(list) ? list : []).map((item) => [item.id, item]));
    (Array.isArray(extras) ? extras : []).forEach((item) => merged.set(item.id, item));
    return [...merged.values()];
  };

  // Contenu visé par une notification (ou un lien) : chargé par son id, même s'il n'est pas dans les
  // listes paginées ci-dessous, et rechargé quand la cible change alors que la page est déjà ouverte.
  const chargerCibles = async (knownPlaylists = playlists) => {
    const [targetTracks, targetVideos, targetArticles, targetImages] = await Promise.all([
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
    const targetPlaylistIdForTrack =
      targetPlaylistId || (Array.isArray(targetTracks) ? targetTracks[0]?.playlist_id : null);
    const extraPlaylists =
      targetPlaylistIdForTrack && !(Array.isArray(knownPlaylists) ? knownPlaylists : []).some((item) => item.id === targetPlaylistIdForTrack)
        ? await base44.entities.Playlist.filter(
            { id: targetPlaylistIdForTrack },
            "-created_date",
            1
          ).catch(() => [])
        : [];
    return { targetTracks, targetVideos, targetArticles, targetImages, extraPlaylists };
  };

  const trierArticles = (list) => list.sort((x, y) => (x.order ?? 99999) - (y.order ?? 99999)
    || new Date(y.created_date || 0) - new Date(x.created_date || 0));

  const loadAll = async () => {
    const [t, s, v, a, y, g, p, pl, pt] = await Promise.all([
      base44.entities.MusicTrack.list("-created_date", 500).catch(() => []),
      base44.entities.Sermon.list("-date", 500).catch(() => []),
      base44.entities.Video.list("-created_date", 500).catch(() => []),
      base44.entities.Article.list("order", 500).catch(() => []),
      loadYoutubeListWithCache(() => base44.entities.YouTubeVideo.list("-created_date")),
      base44.entities.GalleryImage.list("-created_date", 500).catch(() => []),
      base44.entities.PlaylistItem.list("-created_date", 50).catch(() => []),
      // Toutes les playlists et tous les liens : sections > playlists > sous-playlists (petits volumes).
      base44.entities.Playlist.list("-created_date", 2000).catch(() => []),
      base44.entities.PlaylistTrack.list("-created_date", 20000).catch(() => []),
    ]);
    const { targetTracks, targetVideos, targetArticles, targetImages, extraPlaylists } = await chargerCibles(pl);
    setTracks(Array.isArray(t) ? t : []);
    setSermons(Array.isArray(s) ? s : []);
    setVideos(Array.isArray(v) ? v : []);
    setArticles(trierArticles(mergeById(a, targetArticles)));
    setYoutube(mergeById(y, targetVideos));
    setGallery(mergeById(g, targetImages));
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

  // Nouvelle cible alors que Multimédia est déjà ouvert (clic sur une notification, app ouverte).
  const premiereCible = useRef(true);
  useEffect(() => {
    if (premiereCible.current) {
      premiereCible.current = false;
      return;
    }
    if (!targetTrackId && !targetVideoId && !targetArticleId && !targetImageId) return;
    let actif = true;
    chargerCibles().then(({ targetTracks, targetVideos, targetArticles, targetImages, extraPlaylists }) => {
      if (!actif) return;
      if (targetArticles.length) setArticles((list) => trierArticles(mergeById(list, targetArticles)));
      if (targetVideos.length) setYoutube((list) => mergeById(list, targetVideos));
      if (targetImages.length) setGallery((list) => mergeById(list, targetImages));
      if (extraPlaylists.length) setPlaylists((list) => mergeById(list, extraPlaylists));
      if (targetTracks.length) setPlaylistTracks((list) => mergeById(list, targetTracks));
    });
    return () => { actif = false; };
  }, [targetTrackId, targetPlaylistId, targetVideoId, targetArticleId, targetImageId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Un seul groupe « Favoris » : le nouveau titre va à la fin de toute la liste.
      const nextTrackOrder = playlist.reduce((max, p) => Math.max(max, (p.order ?? -1) + 1), 0);
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
    if (currentTrack?.queueId === item.id) {
      toggle();
      return;
    }
    const { tracks, startIndex } = buildFavoriteAudioQueue(playlist, item.id);
    if (startIndex >= 0) playQueue(tracks, startIndex);
  };

  const isPinned = (id, sourcePlaylistId) =>
    playlist.some((p) => p.track_id === id && p.source_playlist_id === sourcePlaylistId);

  const reorderFavoriteItems = async (_groupId, nextItems) => {
    const orders = new Map(nextItems.map((item, index) => [item.id, index]));
    const updates = nextItems.map((item) => ({
      ...item,
      order: orders.get(item.id),
    }));
    // Mise à jour par id : le groupe affiché (« Favoris ») réunit toutes les playlists d'origine.
    const reordonnee = playlist.map((item) => (orders.has(item.id) ? { ...item, order: orders.get(item.id) } : item));
    setPlaylist(reordonnee);
    // Lecture en cours dans les favoris : la file suit le nouvel ordre, sans couper le titre.
    reorderQueue(buildFavoriteAudioQueue(reordonnee, null).tracks);
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

  // Sauvegarde du nouvel ordre des articles (admins uniquement — l'UI du
  // cadenas n'est rendue que pour eux). Écrit le champ `order` sur chaque
  // article déplacé, comme reorderFavoriteItems pour les favoris musicaux.
  const reorderArticles = async (nextArticles) => {
    if (user?.role !== "admin") return;
    const orderById = new Map(nextArticles.map((a, index) => [a.id, index]));
    setArticles((current) => current.map((a) =>
      orderById.has(a.id) ? { ...a, order: orderById.get(a.id) } : a
    ));
    const results = await Promise.all(nextArticles.map((a) =>
      base44.entities.Article.update(a.id, { order: orderById.get(a.id) }).then(() => true, () => false)
    ));
    if (results.includes(false)) {
      toast({ title: "Réorganisation non enregistrée", variant: "destructive" });
      await loadAll();
    }
  };

  // Contenus d'une sous-playlist absents des listes paginées : chargés par leur id.
  const chargerContenus = async (entite, ids) => {
    const setters = { YouTubeVideo: setYoutube, Article: setArticles, GalleryImage: setGallery };
    const set = setters[entite];
    if (!set || !ids?.length) return;
    const rows = await base44.entities[entite].filter({ id: { $in: ids } }, "-created_date", ids.length).catch(() => []);
    if (Array.isArray(rows) && rows.length) set((list) => mergeById(list, rows));
  };

  // Ordre des contenus d'une sous-playlist (admin) : champ `order` des liens PlaylistTrack.
  const reorderLiens = async (playlistId, contenus) => {
    const lienDe = new Map(playlistTracks.filter((t) => t.playlist_id === playlistId).map((t) => [t.track_id, t]));
    const ordre = new Map(contenus.map((c, i) => [lienDe.get(c.id)?.id, i]).filter(([id]) => id));
    setPlaylistTracks((list) => list.map((t) => (ordre.has(t.id) ? { ...t, order: ordre.get(t.id) } : t)));
    const results = await Promise.all([...ordre].map(([id, order]) =>
      base44.entities.PlaylistTrack.update(id, { order }).then(() => true, () => false)
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
          onReorderArticles={reorderArticles}
          onChargerContenus={chargerContenus}
          onReorderLiens={reorderLiens}
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
        />
      )}

    </div>
    </PullToRefresh>
  );
}