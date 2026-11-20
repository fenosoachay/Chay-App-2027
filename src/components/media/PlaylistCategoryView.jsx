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
  Headphones,
} from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import PlaylistCover from "@/components/media/PlaylistCover";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { formatVues } from "@/lib/vues";
import { useCompteur } from "@/hooks/useCompteurVues";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { filePlaylist } from "@/lib/fileLecture";
import ListeTriable from "@/components/media/ListeTriable";
import GrillePlaylists from "@/components/media/GrillePlaylists";
import { arbrePlaylists, liensDe } from "@/lib/playlistsArbre";
import { requestOpenAudioPlayer } from "@/lib/playerUi";
import Description from "@/components/media/Description";
import VideosVerticales from "@/components/media/VideosVerticales";
import { useBackHandler } from "@/hooks/useBackHandler";

// Entité d'où vient la description d'un titre (champ « Description » de l'admin), par section.
const ENTITE_DESCRIPTION = { films: "Video", sermons: "Sermon" };
const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
/** Playlist « Drôle » de la section Vidéo : affichage façon TikTok (« Drôle », « Drôle. », « DRÔLE ! »…). */
const estDrole = (p) => simplifier(p?.name).replace(/[^a-z0-9]/g, "") === "drole";

/** Compteur discret (écoutes ou vues) d'un titre : PlaylistTrack.listen_count, mis à jour pendant la session. */
function CompteurPiste({ piste, unite, Icone }) {
  const n = useCompteur({ type: "piste", id: piste.track_id }, piste.listen_count);
  const texte = formatVues(n, unite) || `0 ${unite}`; // tous les contenus ont un compteur, même à 0
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-foreground/50 bg-muted/60 px-2 py-0.5 rounded-full">
      {Icone && <Icone className="h-3 w-3" aria-hidden="true" />}
      {texte}
    </span>
  );
}

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
  // Section > Playlist (parent, grille de ses sous-playlists) > Sous-playlist (open, ses contenus).
  const [parent, setParent] = useState(null);
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

  const isVideo = kind === "video";
  const { reorderQueue } = useAudioPlayer();

  // Descriptions des titres (vidéos, prédications), affichées seulement quand l'admin les a remplies.
  const [descriptions, setDescriptions] = useState(() => new Map());
  useEffect(() => {
    const entite = ENTITE_DESCRIPTION[category];
    if (!entite) return undefined;
    let vivant = true;
    base44.entities[entite].list("-created_date", 1000)
      .then((rows) => {
        if (!vivant) return;
        setDescriptions(new Map((rows || []).filter((r) => String(r?.description || "").trim()).map((r) => [r.id, r.description])));
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [category]);

  useEffect(() => {
    // Premier niveau seulement : les sous-playlists s'affichent dans leur playlist.
    setOrderedPlaylists(arbrePlaylists(playlists, category));
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
      // Premier niveau : les sous-playlists de chaque playlist sont gardées (champ `sous`).
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
        setOrderedPlaylists(arbrePlaylists(playlists, category));
        toast({
          title: "Réorganisation non enregistrée",
          description: "La mise à jour de l'ordre de certaines playlists a échoué.",
          variant: "destructive",
        });
      }
    },
    [category, playlists, toast]
  );

  /** Ordre des sous-playlists d'une playlist (champ `order` de chaque sous-playlist). */
  const handleReorderSous = useCallback(
    async (parentId, next) => {
      setOrderedPlaylists((list) => list.map((p) => (p.id === parentId ? { ...p, sous: next } : p)));
      const results = await Promise.all(
        next.map((p, i) => base44.entities.Playlist.update(p.id, { order: i }).then(() => true, () => false))
      );
      if (results.includes(false)) {
        setOrderedPlaylists(arbrePlaylists(playlists, category));
        toast({ title: "Réorganisation non enregistrée", variant: "destructive" });
      }
    },
    [category, playlists, toast]
  );

  const handleReorderTracks = useCallback(
    async (next) => {
      setOrderedTracks(next);
      // Lecture en cours dans cette playlist : la file suit le nouvel ordre, sans couper le titre.
      if (!isVideo) reorderQueue(filePlaylist(next, category));
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
    [open, playlistTracks, toast, isVideo, reorderQueue, category]
  );


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
    setParent(targetPlaylist.parent_id ? playlists.find((p) => p.id === targetPlaylist.parent_id) || null : null);
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
    // Retour d'une sous-playlist : grille des sous-playlists de sa playlist.
    if (open?.parent_id && !parent) setParent(playlists.find((p) => p.id === open.parent_id) || null);
    setOpen(null);
    if (targetTrackId || targetPlaylistId) {
      const next = new URLSearchParams(searchParams);
      next.delete("track");
      next.delete("playlist");
      setSearchParams(next, { replace: true });
    }
  };

  // Bouton retour du téléphone : un niveau à la fois (sous-playlist -> playlist -> liste des playlists -> Multimédia).
  useBackHandler(Boolean(parent), () => { setOpen(null); setParent(null); });
  useBackHandler(Boolean(open), closePlaylist);

  /** Playlist avec sous-playlists : on affiche ses sous-playlists ; sinon directement ses contenus. */
  const ouvrirPlaylist = (p) => {
    if ((p.sous || []).length) setParent(p);
    else setOpen(p);
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

  // Playlist ouverte : ses sous-playlists (même style que la grille), et ses titres non classés s'il en reste.
  if (parent && !open) {
    const sous = orderedPlaylists.find((p) => p.id === parent.id)?.sous || [];
    const directs = liensDe(parent.id, playlistTracks).length;
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setParent(null)}
            aria-label="Retour aux playlists"
            className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-display font-extrabold text-2xl truncate flex-1">{parent.name}</h2>
          {isAdmin && sous.length > 1 && (
            <LockToggle locked={playlistsLocked} onToggle={() => setPlaylistsLocked((v) => !v)} />
          )}
        </div>
        <Description texte={parent.description} className="-mt-2 mb-5" />
        {sous.length ? (
          <GrillePlaylists
            id={`sous-${parent.id}`}
            items={sous}
            reorganiser={!playlistsLocked && isAdmin}
            onReorder={(next) => handleReorderSous(parent.id, next)}
            onOuvrir={(sp) => setOpen(sp)}
          />
        ) : (
          <p className="text-foreground/50 text-sm">Aucune sous-playlist pour le moment.</p>
        )}
        {directs > 0 && (
          <button
            type="button"
            onClick={() => setOpen(parent)}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted"
          >
            Non classés ({directs})
          </button>
        )}
      </div>
    );
  }

  if (open) {
    const audioTracks = tracks.filter((t) => !isVideo && t.audio_url);
    const videoQueue = tracks
      .filter((track) => track.video_url)
      .map((track) => ({
        id: track.id,
        src: track.video_url,
        title: track.title,
        poster: track.cover_url,
        vue: { type: "piste", id: track.track_id }, // compteur de vues : +1 à la moitié (useCompteurVues)
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
        <Description texte={open.description} className="-mt-2 mb-5" />

        {tracks.length && !tracksLocked && isAdmin ? (
          <ListeTriable
            id={`pistes-${open.id}`}
            items={tracks}
            onReorder={handleReorderTracks}
            renderRow={(t) => (
              <>
                <PlaylistCover playlist={{ cover_url: t.cover_url, name: t.title }} className="h-10 w-10 shrink-0 rounded-[10px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.title}</span>
              </>
            )}
          />
        ) : tracks.length && isVideo && estDrole(open) ? (
          <VideosVerticales pistes={tracks} descriptions={descriptions} titre={open.name} cibleId={targetTrackId} />
        ) : tracks.length ? (
          <div className="space-y-3">
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
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{t.title}</div>
                      <div className="mt-1"><CompteurPiste piste={t} unite="vue" /></div>
                      <Description texte={descriptions.get(t.track_id)} className="mt-2" />
                    </div>
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
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      const i = audioTracks.findIndex((a) => a.id === t.id);
                      if (currentTrack?.id === t.track_id) {
                        if (isPlaying) requestOpenAudioPlayer();
                        else toggle();
                      } else if (i >= 0) {
                        playQueue(filePlaylist(tracks, category), i);
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
                        <CompteurPiste piste={t} unite="écoute" Icone={Headphones} />
                      </div>
                      <Description texte={descriptions.get(t.track_id)} className="mt-1" />
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
        <GrillePlaylists
          id={`playlists-${category}`}
          items={cats}
          reorganiser={!playlistsLocked && isAdmin}
          onReorder={handleReorderPlaylists}
          onOuvrir={ouvrirPlaylist}
        />
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