import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { useMediaPlayerState } from "@/hooks/useMediaPlayerState";
import { clearMediaControl, publishMediaControl } from "@/lib/mediaControl";

const AudioPlayerContext = createContext();

function shuffledIndices(n, startAt = 0) {
  if (n <= 0) return [];
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== startAt);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [startAt, ...rest];
}

export function AudioPlayerProvider({ children }) {
  const audioRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [order, setOrder] = useState([]);
  const [orderIndex, setOrderIndex] = useState(0);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [loop, setLoop] = useState("off"); // "off" | "all" | "one"
  const mediaControlIdRef = useRef(null);

  const stateRef = useRef({});
  stateRef.current = { queue, order, orderIndex, loop, shuffle, currentTrack, currentTime };

  // Machine à états partagée (tamponnage) — musique & prédications.
  const { state: playerState, bufferedRatio, seek: optimisticSeek } =
    useMediaPlayerState(audioRef, { isLive: false });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (!currentTrack.audio_url) {
      console.warn("[AudioPlayer] piste sans audio_url :", currentTrack?.title, currentTrack?.id);
      return;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.src = currentTrack.audio_url;
    audio.play().then(() => setIsPlaying(true)).catch((e) => {
      console.warn("[AudioPlayer] lecture impossible (URL media invalide ou bloquée) :", currentTrack.audio_url, e?.name, e?.message);
    });
  }, [currentTrack]);

  // Erreur de chargement du média (404/403/format non supporté) → log explicite.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      const e = audio.error;
      console.error("[AudioPlayer] erreur média:", e ? `code ${e.code} (${e.message || ""})` : "inconnue", "src:", audio.src);
    };
    audio.addEventListener("error", onError);
    return () => audio.removeEventListener("error", onError);
  }, []);

  // Toute autre lecture (radio, vidéo) démarrée dans l'app met la musique en pause.
  useEffect(() => {
    const onOtherPlay = (e) => {
      const el = e.target;
      if (!el || el === audioRef.current || el.dataset?.chayAnchor) return;
      if (el.tagName === "AUDIO" || el.tagName === "VIDEO") {
        const a = audioRef.current;
        if (a && !a.paused) a.pause();
      }
    };
    document.addEventListener("play", onOtherPlay, true);
    return () => document.removeEventListener("play", onOtherPlay, true);
  }, []);

  const playAt = useCallback((newIndex) => {
    const { order, queue } = stateRef.current;
    if (!order.length) return;
    const wrapped = ((newIndex % order.length) + order.length) % order.length;
    setOrderIndex(wrapped);
    setCurrentTrack(queue[order[wrapped]]);
  }, []);

  const playQueue = useCallback((tracks, startIndex = 0) => {
    const list = (tracks || []).filter((t) => t?.audio_url);
    if (!list.length) return;
    const idx = Math.max(0, Math.min(startIndex, list.length - 1));
    setQueue(list);
    let ord, start;
    if (stateRef.current.shuffle) {
      ord = shuffledIndices(list.length, idx);
      start = 0;
    } else {
      ord = Array.from({ length: list.length }, (_, i) => i);
      start = idx;
    }
    setOrder(ord);
    setOrderIndex(start);
    setCurrentTrack(list[ord[start]]);
  }, []);

  const play = useCallback((track) => {
    if (!track?.audio_url) return;
    if (currentTrack?.id === track.id) {
      audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
      return;
    }
    setQueue([track]);
    setOrder([0]);
    setOrderIndex(0);
    setCurrentTrack(track);
  }, [currentTrack?.id]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) audio.play().then(() => setIsPlaying(true)).catch(() => {});
    else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const next = useCallback(() => {
    const { order, orderIndex, loop } = stateRef.current;
    if (orderIndex + 1 < order.length) playAt(orderIndex + 1);
    else if (loop === "all" && order.length > 0) playAt(0);
  }, [playAt]);
  const prev = useCallback(() => {
    const audio = audioRef.current;
    const { currentTime, order, orderIndex, loop } = stateRef.current;
    if (orderIndex > 0) {
      playAt(orderIndex - 1);
      return;
    }
    if (audio && currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (loop === "all" && order.length > 0) playAt(order.length - 1);
    else if (audio) audio.currentTime = 0;
  }, [playAt]);

  const seek = (t) => optimisticSeek(t);

  const stop = () => {
    const audio = audioRef.current;
    currentTrack?.onStop?.(currentTime);
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setQueue([]);
    setOrder([]);
    setOrderIndex(0);
    setCurrentTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      const ns = !s;
      const { queue, currentTrack } = stateRef.current;
      if (queue.length) {
        const curIdx = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
        if (ns) {
          const ord = shuffledIndices(queue.length, Math.max(0, curIdx));
          setOrder(ord);
          setOrderIndex(0);
        } else {
          const ord = Array.from({ length: queue.length }, (_, i) => i);
          setOrder(ord);
          setOrderIndex(Math.max(0, curIdx));
        }
      }
      return ns;
    });
  }, []);

  const toggleLoop = useCallback(
    () => setLoop((l) => (l === "off" ? "all" : l === "all" ? "one" : "off")),
    []
  );

  const isBibleTrack = currentTrack?.mediaType === "bible";
  const hasPrevious = currentTrack?.hasPrevious ?? (
    isBibleTrack
      ? orderIndex > 0 || currentTime > 3 || (loop === "all" && order.length > 0)
      : Boolean(currentTrack)
  );
  const hasNext = currentTrack?.hasNext ?? (orderIndex < order.length - 1 || loop === "all");

  useEffect(() => {
    if (!currentTrack) {
      if (mediaControlIdRef.current) {
        clearMediaControl(mediaControlIdRef.current);
        mediaControlIdRef.current = null;
      }
      return;
    }
    mediaControlIdRef.current = publishMediaControl({
      type: currentTrack.mediaType || currentTrack.category || currentTrack.kind || "audio",
      engine: "audio",
      title: currentTrack.title || "Média",
      subtitle: currentTrack.artist || currentTrack.speaker || currentTrack.subtitle || "",
      artwork: currentTrack.cover_url || currentTrack.artwork || null,
      source: currentTrack.audio_url,
      isPlaying,
      currentTime,
      duration,
      bufferedRatio,
      isLive: false,
      hasPrevious,
      hasNext,
      queue: order.map((index) => queue[index]),
      queueIndex: orderIndex,
      toggle,
      play: () => audioRef.current?.play().catch(() => {}),
      pause: () => audioRef.current?.pause(),
      previous: currentTrack.previousAction || (hasPrevious ? prev : null),
      next: currentTrack.nextAction || (hasNext ? next : null),
      seek,
      stop,
      isBuffering: playerState === "connecting" || playerState === "buffering",
      open: () => {},
    });
  }, [
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    bufferedRatio,
    hasPrevious,
    hasNext,
    order,
    orderIndex,
    queue,
    playerState,
    toggle,
    prev,
    next,
    seek,
    stop,
  ]);

  useEffect(() => () => {
    if (mediaControlIdRef.current) clearMediaControl(mediaControlIdRef.current);
  }, []);

  const handleEnded = () => {
    const { loop, order, orderIndex } = stateRef.current;
    if (typeof stateRef.current.currentTrack?.onEnded === "function") {
      stateRef.current.currentTrack.onEnded();
      return;
    }
    if (loop === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      return;
    }
    if (orderIndex + 1 < order.length) {
      playAt(orderIndex + 1);
      return;
    }
    // loop "all" wraps back to the start of the order
    if (loop === "all" && order.length > 0) {
      playAt(0);
      return;
    }
    // no loop, end of list → stop cleanly, no auto-restart
    setIsPlaying(false);
  };

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        play,
        playQueue,
        toggle,
        seek,
        stop,
        next,
        prev,
        shuffle,
        loop,
        toggleShuffle,
        toggleLoop,
        playerState,
        bufferedRatio,
        hasPrevious,
        hasNext,
      }}
    >
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          const initialTime = Math.max(0, Number(currentTrack?.initialTime) || 0);
          if (initialTime > 0 && initialTime < audio.duration) audio.currentTime = initialTime;
          setDuration(audio.duration);
        }}
        onEnded={handleEnded}
      />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export const useAudioPlayer = () => useContext(AudioPlayerContext);