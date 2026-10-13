import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import YouTubeCard from "@/components/media/YouTubeCard";
import YouTubeToolbar from "@/components/media/YouTubeToolbar";
import YouTubeSortableList from "@/components/media/YouTubeSortableList";
import YouTubeEditBar from "@/components/media/YouTubeEditBar";
import YouTubeShuffleBanner from "@/components/media/YouTubeShuffleBanner";
import { clearMediaControl, requestMediaPlayback } from "@/lib/mediaControl";
import { useYoutubePrefs } from "@/hooks/useYoutubePrefs";
import { applySavedOrder, shuffleArray } from "@/lib/youtubePrefs";

const SECTION_LABELS = { culte: "Culte", louange: "Louange", celebration: "Célébration" };

export default function YouTubeCategoryView({ section, youtube = [], targetVideoId }) {
  const [playingId, setPlayingId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { prefs, update } = useYoutubePrefs();

  const [shuffled, setShuffled] = useState(null); // ordre aléatoire courant (ids)
  const [finished, setFinished] = useState(false);
  const [pulse, setPulse] = useState(false);
  const shuffleRef = useRef(null);

  const baseItems = useMemo(
    () => youtube.filter((y) => (y.section || "culte") === section),
    [youtube, section]
  );
  const customItems = useMemo(
    () => applySavedOrder(baseItems, prefs.playlist_orders[section]),
    [baseItems, prefs.playlist_orders, section]
  );
  const shuffleOn = Boolean(prefs.shuffle_modes[section]);
  const locked = prefs.playlist_locks[section] !== false; // verrouillée par défaut
  const editing = !locked; // cadenas ouvert = réorganisation active

  // File de lecture : ordre aléatoire courant si actif, sinon ordre personnalisé.
  const queueItems = useMemo(() => {
    if (shuffleOn && shuffled) {
      const byId = new Map(customItems.map((v) => [v.id, v]));
      const ordered = shuffled.map((id) => byId.get(id)).filter(Boolean);
      customItems.forEach((v) => { if (!shuffled.includes(v.id)) ordered.push(v); });
      return ordered;
    }
    return customItems;
  }, [customItems, shuffleOn, shuffled]);
  shuffleRef.current = { shuffleOn };

  const stopUrlVideo = useCallback(() => {
    if (location.pathname === "/media" && searchParams.has("video")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("video");
      setSearchParams(nextParams, { replace: true });
    }
  }, [location.pathname, searchParams, setSearchParams]);

  const playQueue = useCallback((list, index) => {
    const item = list[index];
    if (!item?.youtube_id) return;
    setFinished(false);
    let id;
    const stop = () => {
      clearMediaControl(id);
      setPlayingId(null);
      stopUrlVideo();
    };
    const hasNext = index < list.length - 1;
    id = requestMediaPlayback({
      type: "youtube",
      engine: "youtube",
      title: item.title || "Vidéo YouTube",
      subtitle: `${SECTION_LABELS[section] || section}${shuffleRef.current?.shuffleOn ? " · Aléatoire" : ""}`,
      artwork: item.thumbnail_url || item.cover_url || `https://img.youtube.com/vi/${item.youtube_id}/hqdefault.jpg`,
      source: item.youtube_id,
      isPlaying: true,
      isBuffering: true,
      currentTime: 0,
      duration: 0,
      isLive: false,
      previous: index > 0 ? () => playQueue(list, index - 1) : null,
      // Fin de liste en mode aléatoire : on propose de recommencer.
      next: hasNext
        ? () => playQueue(list, index + 1)
        : shuffleRef.current?.shuffleOn
          ? () => { stop(); setFinished(true); }
          : null,
      queue: list.map((entry) => ({
        id: entry.id,
        title: entry.title,
        source: entry.youtube_id,
        artwork: entry.thumbnail_url || entry.cover_url || null,
      })),
      queueIndex: index,
      stop,
    }, "youtube");
    setPlayingId(item.id);
  }, [section, stopUrlVideo]);

  const startVideoAt = useCallback((index) => {
    playQueue(queueItems, index);
  }, [playQueue, queueItems]);

  useEffect(() => {
    if (!targetVideoId) return;
    const targetIndex = queueItems.findIndex((video) => video.id === targetVideoId);
    if (targetIndex >= 0) startVideoAt(targetIndex);
    else setPlayingId(null);
  }, [targetVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startShuffle = () => {
    const order = shuffleArray(customItems).map((v) => v.id);
    const byId = new Map(customItems.map((v) => [v.id, v]));
    const list = order.map((id) => byId.get(id));
    setShuffled(order);
    setFinished(false);
    shuffleRef.current = { shuffleOn: true };
    playQueue(list, 0);
  };

  const toggleShuffle = () => {
    if (shuffleOn) {
      update("shuffle_modes", section, false);
      setShuffled(null);
      setFinished(false);
      return;
    }
    update("shuffle_modes", section, true);
    setPulse(true);
    setTimeout(() => setPulse(false), 700);
    startShuffle();
  };


  // Chaque déplacement est enregistré tout de suite (plus de bouton « Enregistrer »).
  const reorder = (next) => update("playlist_orders", section, next.map((v) => v.id));
  const resetOrder = () => update("playlist_orders", section, undefined);
  const toggleLock = () => update("playlist_locks", section, !locked);

  const shown = editing ? customItems : queueItems;
  const playingIndex = shown.findIndex((v) => v.id === playingId);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-foreground/55">
          Vidéos YouTube — {SECTION_LABELS[section] || section}.
        </p>
      </div>

      <YouTubeToolbar
        locked={locked}
        shuffleOn={shuffleOn}
        pulse={pulse}
        disabled={!customItems.length}
        onToggleShuffle={toggleShuffle}
        onToggleLock={toggleLock}
      />

      <YouTubeShuffleBanner
        shuffleOn={shuffleOn}
        finished={finished}
        onRestart={startShuffle}
        onDismiss={() => setFinished(false)}
      />

      {shown.length ? (
        editing ? (
          <>
            <YouTubeEditBar onReset={resetOrder} />
            <YouTubeSortableList items={customItems} onReorder={reorder} />
          </>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {shown.map((y, i) => (
              <YouTubeCard
                key={y.id}
                video={y}
                index={i}
                playingIndex={playingIndex}
                onPlay={startVideoAt}
              />
            ))}
          </div>
        )
      ) : (
        <p className="text-foreground/50 text-sm">Aucune vidéo pour le moment.</p>
      )}
      {targetVideoId && !baseItems.some((video) => video.id === targetVideoId) && (
        <p role="status" className="mt-4 text-sm text-foreground/60">
          Cette vidéo n'est plus disponible dans cette section.
        </p>
      )}
    </div>
  );
}