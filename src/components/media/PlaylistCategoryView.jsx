import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Film,
  Play,
  Pause,
  Star,
  Lock,
  Unlock,
  GripVertical,
  Headphones,
} from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import PlaylistCover from "@/components/media/PlaylistCover";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { formatListenCount } from "@/lib/playlist";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { useHalfwayListen } from "@/hooks/useHalfwayListen";
import { requestOpenAudioPlayer } from "@/lib/playerUi";

/* ─── Hook drag & drop tactile + souris ─────────────────────────────────── */
function useDragSort(items, onReorder) {
  const dragIdx = useRef(null);
  const listRef = useRef(null);

  const getItemEls = () =>
    listRef.current ? Array.from(listRef.current.children) : [];

  const indexFromY = (clientY) => {
    const els = getItemEls();
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return els.length - 1;
  };

  /* ── souris ── */
  const onMouseDown = useCallback(
    (idx) => (e) => {
      e.preventDefault();
      dragIdx.current = idx;
      const els = getItemEls();
      els[idx]?.classList.add("opacity-50", "scale-[0.98]");

      const onMove = (me) => {
        const target = indexFromY(me.clientY);
        els.forEach((el, i) => {
          el.style.transform = "";
          if (i === dragIdx.current) return;
          if (
            dragIdx.current < target
              ? i > dragIdx.current && i <= target
              : i < dragIdx.current && i >= target
          ) {
            el.style.transform =
              dragIdx.current < target ? "translateY(-56px)" : "translateY(56px)";
          }
        });
      };

      const onUp = (me) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const from = dragIdx.current;
        dragIdx.current = null;
        els.forEach((el) => {
          el.classList.remove("opacity-50", "scale-[0.98]");
          el.style.transform = "";
        });
        const to = indexFromY(me.clientY);
        if (from !== null && from !== to && to >= 0 && to < items.length) {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          onReorder(next);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [items, onReorder]
  );

  /* ── tactile ── */
  const onTouchStart = useCallback(
    (idx) => () => {
      dragIdx.current = idx;
      const els = getItemEls();
      els[idx]?.classList.add("opacity-50", "scale-[0.98]");

      const onMove = (te) => {
        te.preventDefault();
        const touch = te.touches[0];
        const target = indexFromY(touch.clientY);
        els.forEach((el, i) => {
          el.style.transform = "";
          if (i === dragIdx.current) return;
          if (
            dragIdx.current < target
              ? i > dragIdx.current && i <= target
              : i < dragIdx.current && i >= target
          ) {
            el.style.transform =
              dragIdx.current < target ? "translateY(-56px)" : "translateY(56px)";
          }
        });
      };

      const onEnd = (te) => {
        listRef.current?.removeEventListener("touchmove", onMove);
        listRef.current?.removeEventListener("touchend", onEnd);
        const from = dragIdx.current;
        dragIdx.current = null;
        els.forEach((el) => {
          el.classList.remove("opacity-50", "scale-[0.98]");
          el.style.transform = "";
        });
        const touch = te.changedTouches[0];
        const to = indexFromY(touch.clientY);
        if (from !== null && from !== to && to >= 0 && to < items.length) {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          onReorder(next);
        }
      };

      listRef.current?.addEventListener("touchmove", onMove, { passive: false });
      listRef.current?.addEventListener("touchend", onEnd);
    },
    [items, onReorder]
  );

  return { listRef, onMouseDown, onTouchStart };
}

/* ─── Cadenas ──────────────────────────────────────────────────────────── */
function LockToggle({ locked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
      aria-label={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
      aria-pressed={!locked}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
        locked
          ? "border-border bg-card text-muted-foreground hover:bg-muted"
          : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
      }`}
    >
      {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function PlaylistCategoryView({
  category,
  kind = "audio",
  playlists = [],
  playlistTracks = [],
  currentTrack,
  isPlaying,
  playQueue,
  toggle,
  isAdmin,
  onToggleFavorite,
  isFavorite,
  favoriteCategory,
}) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(null);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const trackNodes = useRef(new Map());
  const targetTrackId = searchParams.get("track");
  const targetPlaylistId = searchParams.get("playlist");

  /* Cadenas réorganisation admin */
  const [playlistsLocked, setPlaylistsLocked] = useState(true);
  const [tracksLocked, setTracksLocked] = useState(true);

  /* États locaux ordonnables */
  const [orderedPlaylists, setOrderedPlaylists] = useState([]);
  const [orderedTracks, setOrderedTracks] = useState([]);

  /* Comptage d'écoutes local optimiste */
  const [listenCounts, setListenCounts] = useState({});

  const isVideo = kind === "video";

  useEffect(() => {
    const filtered = playlists
      .filter((p) => (p.category || "music") === category)
      .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));
    setOrderedPlaylists(filtered);
  }, [playlists, category]);

  useEffect(() => {
    if (!open) {
      setOrderedTracks([]);
      return;
    }
    const filtered = playlistTracks
      .filter((t) => t.playlist_id === open.id)
      .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999));
    setOrderedTracks(filtered);
  }, [open, playlistTracks]);

  const handleReorderPlaylists = useCallback(
    async (next) => {
      setOrderedPlaylists(next);
      const results = await Promise.all(
        next.map((p, i) =>
          base44.entities.Playlist.update(p.id, { order: i }).then(
            () => true,
            () => false
          )
        )
      );
      if (results.includes(false)) {
        setOrderedPlaylists(
          playlists
            .filter((playlist) => (playlist.category || "music") === category)
            .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999))
        );
        toast({
          title: "Réorganisation non enregistrée",
          description: "La mise à jour de l'ordre de certaines playlists a échoué.",
          variant: "destructive",
        });
      }
    },
    [category, playlists, toast]
  );

  const handleReorderTracks = useCallback(
    async (next) => {
      setOrderedTracks(next);
      const results = await Promise.all(
        next.map((t, i) =>
          base44.entities.PlaylistTrack.update(t.id, { order: i }).then(
            () => true,
            () => false
          )
        )
      );
      if (results.includes(false)) {
        setOrderedTracks(
          playlistTracks
            .filter((track) => track.playlist_id === open?.id)
            .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999))
        );
        toast({
          title: "Réorganisation non enregistrée",
          description: "La mise à jour de l'ordre de certains morceaux a échoué.",
          variant: "destructive",
        });
      }
    },
    [open, playlistTracks, toast]
  );

  const playlistDrag = useDragSort(orderedPlaylists, handleReorderPlaylists);
  const trackDrag = useDragSort(orderedTracks, handleReorderTracks);

  const recordListen = useCallback(
    async (track) => {
      if (!track?.id) return;
      try {
        const response = await base44.functions.invoke("recordMediaListen", {
          playlist_track_id: track.id,
        });
        const nextCount = Number(
          response?.data?.listen_count ?? response?.listen_count
        );
        if (!Number.isFinite(nextCount) || nextCount < 0) {
          throw new Error("Invalid listen count response");
        }
        setListenCounts((prev) => ({ ...prev, [track.id]: nextCount }));
      } catch (error) {
        console.error("[PlaylistCategoryView] Could not record audio listen.", error);
        toast({
          title: "Écoute non enregistrée",
          description: "Le morceau est en lecture, mais le compteur n'a pas pu être mis à jour.",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // Une écoute n'est comptée qu'à la moitié du morceau (une fois par lecture).
  const { currentTime, duration } = useAudioPlayer();
  useHalfwayListen(currentTrack, currentTime, duration, (trackId) => {
    const row = playlistTracks.find((pt) => pt.track_id === trackId);
    if (row) recordListen(row);
  });

  const cats = orderedPlaylists;
  const tracks = open ? orderedTracks : [];

  useEffect(() => {
    if (!targetTrackId) {
      setTargetUnavailable(false);
      return;
    }

    const target = playlistTracks.find(
      (track) =>
        track.track_id === targetTrackId &&
        (!targetPlaylistId || track.playlist_id === targetPlaylistId)
    );
    const targetPlaylistIdForTrack = targetPlaylistId || target?.playlist_id;
    const targetPlaylist = playlists.find(
      (playlist) => playlist.id === targetPlaylistIdForTrack
    );

    const mediaUrl = category === "films" ? target?.video_url : target?.audio_url;
    if (
      !target ||
      !targetPlaylist ||
      target.playlist_id !== targetPlaylist.id ||
      (targetPlaylist.category || "music") !== category ||
      !mediaUrl
    ) {
      setOpen(null);
      setTargetUnavailable(true);
      return;
    }

    setTargetUnavailable(false);
    setOpen(targetPlaylist);
  }, [category, targetTrackId, targetPlaylistId, playlistTracks, playlists]);

  useEffect(() => {
    if (!targetTrackId || !open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      trackNodes.current.get(targetTrackId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [targetTrackId, open, tracks]);

  const closePlaylist = () => {
    setOpen(null);
    if (targetTrackId || targetPlaylistId) {
      const next = new URLSearchParams(searchParams);
      next.delete("track");
      next.delete("playlist");
      setSearchParams(next, { replace: true });
    }
  };

  const favItem = (t) => ({
    id: t.track_id,
    title: t.title,
    artist: t.artist,
    audio_url: t.audio_url,
    video_url: t.video_url,
    cover_url: t.cover_url,
    kind: t.kind,
    source_playlist_id: open?.id,
    source_playlist_name: open?.name,
  });

  if (open) {
    const audioTracks = tracks.filter((t) => !isVideo && t.audio_url);
    const videoQueue = tracks
      .filter((track) => track.video_url)
      .map((track) => ({
        id: track.id,
        src: track.video_url,
        title: track.title,
        poster: track.cover_url,
      }));
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={closePlaylist}
            className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-display font-extrabold text-2xl truncate flex-1">
            {open.name}
          </h2>
          {isAdmin && tracks.length > 1 && (
            <LockToggle
              locked={tracksLocked}
              onToggle={() => setTracksLocked((v) => !v)}
            />
          )}
        </div>

        {tracks.length ? (
          <div ref={trackDrag.listRef} className="space-y-3">
            {tracks.map((t, idx) =>
              isVideo ? (
                <div
                  key={t.id}
                  ref={(node) => {
                    if (node) trackNodes.current.set(t.track_id, node);
                    else trackNodes.current.delete(t.track_id);
                  }}
                  data-track-id={t.track_id}
                  className={`rounded-2xl border border-border bg-card overflow-hidden ${
                    targetTrackId === t.track_id ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {!tracksLocked && isAdmin && (
                    <div
                      className="cursor-grab active:cursor-grabbing touch-none p-2 text-muted-foreground bg-muted/40 flex items-center gap-2 border-b border-border text-xs font-semibold"
                      onMouseDown={trackDrag.onMouseDown(idx)}
                      onTouchStart={trackDrag.onTouchStart(idx)}
                    >
                      <GripVertical className="h-4 w-4" />
                      <span>Déplacer</span>
                    </div>
                  )}
                  {t.video_url ? (
                    <VideoPlayer
                      src={t.video_url}
                      poster={t.cover_url}
                      title={t.title}
                      queue={videoQueue}
                      currentIndex={videoQueue.findIndex((item) => item.id === t.id)}
                      className="w-full max-h-72"
                    />
                  ) : (
                    <div className="h-40 brand-gradient grid place-items-center">
                      <Film className="h-10 w-10 text-white/90" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0 font-bold truncate">{t.title}</div>
                    {favoriteCategory === "music" && (
                      <button
                        onClick={() => onToggleFavorite?.(favItem(t), favoriteCategory)}
                        className={`h-9 w-9 grid place-items-center rounded-full hover:bg-muted ${isFavorite?.(t.track_id, open?.id) ? "text-primary" : "text-foreground/40 hover:text-primary"}`}
                        title="Ajouter aux favoris"
                        aria-label={isFavorite?.(t.track_id, open?.id) ? "Déjà dans vos favoris" : "Ajouter aux favoris"}
                      >
                        <Star className="h-4 w-4" fill={isFavorite?.(t.track_id, open?.id) ? "currentColor" : "none"} />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  key={t.id}
                  ref={(node) => {
                    if (node) trackNodes.current.set(t.track_id, node);
                    else trackNodes.current.delete(t.track_id);
                  }}
                  data-track-id={t.track_id}
                  className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-transform duration-150 select-none ${
                    targetTrackId === t.track_id ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {!tracksLocked && isAdmin && (
                    <div
                      className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground"
                      onMouseDown={trackDrag.onMouseDown(idx)}
                      onTouchStart={trackDrag.onTouchStart(idx)}
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                  )}
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      const i = audioTracks.findIndex((a) => a.id === t.id);
                      if (currentTrack?.id === t.track_id) {
                        // Titre déjà en cours : on rouvre le lecteur, la pause
                        // se fait uniquement avec son bouton pause.
                        if (isPlaying) requestOpenAudioPlayer();
                        else toggle();
                      } else if (i >= 0) {
                        playQueue(
                          audioTracks.map((a) => ({
                            id: a.track_id,
                            title: a.title,
                            artist: a.artist,
                            audio_url: a.audio_url,
                            cover_url: a.cover_url,
                            mediaType: category === "sermons" ? "sermons" : "music",
                          })),
                          i
                        );
                      }
                    }}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0">
                      {currentTrack?.id === t.track_id && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{t.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.artist && <div className="text-xs text-foreground/55">{t.artist}</div>}
                        {(() => {
                          const count = listenCounts[t.id] ?? t.listen_count ?? 0;
                          const formatted = formatListenCount(count);
                          if (!formatted) return null;
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/50 bg-muted/60 px-2 py-0.5 rounded-full">
                              <Headphones className="h-3 w-3" />
                              {formatted}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {favoriteCategory === "music" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(favItem(t), favoriteCategory); }}
                      className={`h-9 w-9 grid place-items-center rounded-full hover:bg-muted ${isFavorite?.(t.track_id, open?.id) ? "text-primary" : "text-foreground/40 hover:text-primary"}`}
                      title="Ajouter aux favoris"
                      aria-label={isFavorite?.(t.track_id, open?.id) ? "Déjà dans vos favoris" : "Ajouter aux favoris"}
                    >
                      <Star className="h-4 w-4" fill={isFavorite?.(t.track_id, open?.id) ? "currentColor" : "none"} />
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        ) : (
          <p className="text-foreground/50 text-sm">
            Aucun titre dans cette playlist pour le moment.
          </p>
        )}

      </div>
    );
  }

  return (
    <div>
      {targetUnavailable && (
        <p role="status" className="mb-4 text-sm text-foreground/60">
          Ce contenu n'est plus disponible dans cette playlist.
        </p>
      )}
      <div className="flex items-center justify-between mb-5 gap-3">
        <p className="text-sm text-foreground/55">
          Les contenus sont organisés en playlist. Ajoutez vos chansons préférées dans vos favoris.
        </p>
        {isAdmin && cats.length > 1 && (
          <LockToggle
            locked={playlistsLocked}
            onToggle={() => setPlaylistsLocked((v) => !v)}
          />
        )}
      </div>

      {cats.length ? (
        <div
          ref={playlistsLocked ? null : playlistDrag.listRef}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {cats.map((p, idx) => {
            const count = playlistTracks.filter((pt) => pt.playlist_id === p.id).length;
            return (
              <div
                key={p.id}
                className="relative group w-full rounded-[1.5rem] border border-border bg-card p-4 text-left transition-transform duration-150 select-none hover:-translate-y-1 hover:shadow-lg"
              >
                {!playlistsLocked && isAdmin && (
                  <div
                    className="absolute top-2 right-2 z-10 cursor-grab active:cursor-grabbing touch-none p-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-foreground hover:bg-muted"
                    onMouseDown={playlistDrag.onMouseDown(idx)}
                    onTouchStart={playlistDrag.onTouchStart(idx)}
                    title="Glisser pour réorganiser"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (playlistsLocked) setOpen(p);
                  }}
                  className="w-full text-left"
                >
                  <PlaylistCover
                    playlist={p}
                    className="aspect-square rounded-2xl mb-3"
                  />
                  <div className="font-bold text-sm line-clamp-1">{p.name}</div>
                  <div className="text-xs text-foreground/55">{count} titre(s)</div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">
          Aucune playlist pour le moment
          {isAdmin
            ? ". Créez-en une depuis le panneau d'administration."
            : "."}
        </p>
      )}

    </div>
  );
}