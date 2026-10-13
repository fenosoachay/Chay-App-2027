import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Film, Pause, Play, Radio, SkipBack, SkipForward, Square, X } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useBackHandler } from "@/hooks/useBackHandler";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useBackgroundPlayback } from "@/hooks/useBackgroundPlayback";
import { useNetwork } from "@/lib/NetworkContext";
import PlayerQueueList from "@/components/player/PlayerQueueList";
import OfflinePlayerNotice from "@/components/player/OfflinePlayerNotice";
import {
  buildYouTubeEmbedUrl,
  YOUTUBE_ORIGIN,
  YOUTUBE_REFERRER_POLICY,
} from "@/lib/youtubeEmbed";
import {
  clearMediaControl,
  subscribeMediaControl,
  subscribeMediaPlaybackRequests,
  updateMediaControl,
} from "@/lib/mediaControl";

const AUDIO_TYPES = new Set(["audio", "music", "sermon", "sermons", "predication", "bible"]);
const isAudioControl = (control) =>
  AUDIO_TYPES.has(control?.type) || control?.engine === "audio";

export default function UniversalMediaSurface() {
  const [control, setControl] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const controlRef = useRef(null);
  controlRef.current = control;
  const youtubePlayingRef = useRef(false);

  useEffect(() => subscribeMediaControl(setControl), []);

  const playYouTube = (source) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const url = buildYouTubeEmbedUrl(source, window.location.origin);
    if (!url) {
      const active = controlRef.current;
      if (active?.type === "youtube") {
        updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
      }
      return;
    }
    if (iframe.src !== url) iframe.src = url;
    youtubePlayingRef.current = true;
  };

  const playVideo = (source) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src !== source) {
      video.pause();
      video.src = source;
      video.load();
    }
    if (video.paused) {
      video.play().catch(() => {
        const active = controlRef.current;
        if (active) updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
      });
    }
  };

  useEffect(() => subscribeMediaPlaybackRequests((requested) => {
    if (requested.type === "video") playVideo(requested.source);
    else if (requested.type === "youtube") playYouTube(requested.source);
    if (requested.type === "video" || requested.type === "youtube" || requested.type === "radio") {
      setExpanded(true);
    }
  }), []);

  useEffect(() => {
    if (!control) {
      videoRef.current?.pause();
      if (videoRef.current) {
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      if (iframeRef.current) iframeRef.current.src = "about:blank";
      youtubePlayingRef.current = false;
      setExpanded(false);
      return;
    }

    if (control.type === "video") {
      playVideo(control.source);
      setExpanded(true);
    } else {
      videoRef.current?.pause();
      if (control.type === "youtube") {
        playYouTube(control.source);
        setExpanded(true);
      } else if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
        youtubePlayingRef.current = false;
      }
      if (control.type === "radio") setExpanded(true);
    }
  }, [control?.id, control?.source, control?.type]);

  useEffect(() => {
    if (!control || isAudioControl(control)) return undefined;
    const id = control.id;
    const currentControl = control;
    const toggle = () => {
      const active = controlRef.current;
      if (!active || active.id !== id) return;
      if (active.type === "video") {
        const video = videoRef.current;
        if (video?.paused) video.play().catch(() => {});
        else video?.pause();
      } else if (active.type === "youtube") {
        const command = youtubePlayingRef.current ? "pauseVideo" : "playVideo";
        youtubePlayingRef.current = !youtubePlayingRef.current;
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: command, args: [] }),
          YOUTUBE_ORIGIN
        );
        updateMediaControl(id, { isPlaying: youtubePlayingRef.current });
      } else {
        active.toggle?.();
      }
    };
    const stop = () => {
      if (currentControl.type === "video") {
        const video = videoRef.current;
        video?.pause();
        if (video) {
          video.removeAttribute("src");
          video.load();
        }
      } else if (currentControl.type === "youtube") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "stopVideo", args: [] }),
          YOUTUBE_ORIGIN
        );
        if (iframeRef.current) iframeRef.current.src = "about:blank";
        youtubePlayingRef.current = false;
      } else {
        currentControl.stop?.();
      }
      clearMediaControl(id);
    };
    const seek = (time) => {
      if (currentControl.type === "video" && videoRef.current) {
        videoRef.current.currentTime = time;
      } else if (currentControl.type === "youtube") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "seekTo", args: [time, true] }),
          YOUTUBE_ORIGIN
        );
      }
    };
    updateMediaControl(id, {
      toggle,
      stop,
      minimize: () => setExpanded(false),
      open: () => setExpanded(true),
      seek: currentControl.type === "video" || currentControl.type === "youtube" ? seek : null,
    });
  }, [control?.id, control?.type]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== YOUTUBE_ORIGIN) return;
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      const active = controlRef.current;
      if (active?.type !== "youtube") return;
      if (data?.event === "onStateChange") {
        const playerState = Number(data.info);
        updateMediaControl(active.id, {
          ...(playerState === 1 ? { isPlaying: true, isBuffering: false } : {}),
          ...(playerState === 2 || playerState === 0 ? { isPlaying: false, isBuffering: false } : {}),
          ...(playerState === 3 ? { isBuffering: true } : {}),
        });
        if (playerState === 0) active.next?.();
        return;
      }
      if (data?.event !== "infoDelivery" || !data.info) return;
      const currentTime = Number(data.info.currentTime);
      const duration = Number(data.info.duration);
      const playerState = data.info.playerState;
      updateMediaControl(active.id, {
        ...(Number.isFinite(currentTime) ? { currentTime } : {}),
        ...(Number.isFinite(duration) ? { duration } : {}),
        ...(playerState === 1 ? { isPlaying: true, isBuffering: false } : {}),
        ...(playerState === 2 ? { isPlaying: false } : {}),
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const isFullPlayer = expanded && control && !isAudioControl(control);
  const isVideo = control?.type === "video";
  const isYouTube = control?.type === "youtube";
  const isRadio = control?.type === "radio";
  const { isOnline } = useNetwork();
  const [retryTick, setRetryTick] = useState(0);
  const blockedOffline = Boolean(isYouTube && !isOnline);
  const showEmbeddedPlayer = Boolean(isFullPlayer && (isVideo || isYouTube) && !blockedOffline);
  useBackHandler(Boolean(isFullPlayer), () => setExpanded(false));
  // Écran gardé allumé tant qu'une vidéo YouTube joue en ligne ; coupé à la pause/fermeture.
  useKeepAwake(Boolean(isYouTube && control?.isPlaying && isOnline));

  // Lecture poursuivie écran éteint / app en arrière-plan (vidéo et YouTube).
  useBackgroundPlayback({
    active: Boolean(control && (isVideo || isYouTube)),
    getVideo: () => videoRef.current,
    getIframe: () => iframeRef.current,
    isPlaying: () => Boolean(controlRef.current?.isPlaying),
  });

  // Retour du réseau : on relance la vidéo bloquée.
  useEffect(() => {
    if (isOnline && isYouTube && control?.source) playYouTube(control.source);
  }, [isOnline, retryTick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isFullPlayer ? 1 : 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal={Boolean(isFullPlayer)}
      aria-label={control ? `Lecteur : ${control.title}` : "Lecteur multimédia"}
      aria-hidden={!isFullPlayer}
      style={{ pointerEvents: isFullPlayer ? "auto" : "none" }}
      className="fixed inset-0 z-[65] flex flex-col bg-black/95 p-4 text-white"
    >
      {control && (
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{control.title}</p>
            <p className="text-xs text-white/60">
              {isRadio ? "Radio · En direct" : control.subtitle || "Lecture"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Réduire le lecteur"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {blockedOffline && (
        <OfflinePlayerNotice onRetry={() => setRetryTick((t) => t + 1)} />
      )}

      {control && !isVideo && !isYouTube && (
        <div className="flex flex-1 items-center justify-center py-5">
          <div className="text-center">
            {control.artwork ? (
              <Image src={control.artwork} alt="" fittingType="fill" className="mx-auto mb-5 aspect-square w-56 rounded-2xl object-cover" />
            ) : isRadio ? (
              <Radio className="mx-auto mb-5 h-24 w-24 text-white/80" aria-hidden="true" />
            ) : (
              <Film className="mx-auto mb-5 h-24 w-24 text-white/80" aria-hidden="true" />
            )}
            <p className="font-bold">{isRadio ? "EN DIRECT" : "En lecture"}</p>
          </div>
        </div>
      )}

      <div
        className={`mx-auto w-full max-w-5xl overflow-hidden rounded-xl bg-black ${
          showEmbeddedPlayer
            ? "my-auto aspect-video"
            : "pointer-events-none fixed bottom-0 right-0 h-[200px] w-[320px] opacity-0"
        }`}
        aria-hidden={!showEmbeddedPlayer}
      >
        <video
          ref={videoRef}
          className={`h-full w-full object-contain ${isVideo ? "block" : "hidden"}`}
          playsInline
          controls={showEmbeddedPlayer && isVideo}
          controlsList="nodownload"
          disablePictureInPicture
          onPlay={() => {
            const active = controlRef.current;
            if (active) updateMediaControl(active.id, { isPlaying: true, isBuffering: false });
          }}
          onPause={() => {
            const active = controlRef.current;
            if (active?.type === "video") updateMediaControl(active.id, { isPlaying: false });
          }}
          onWaiting={() => {
            const active = controlRef.current;
            if (active?.type === "video") updateMediaControl(active.id, { isBuffering: true });
          }}
          onPlaying={() => {
            const active = controlRef.current;
            if (active?.type === "video") updateMediaControl(active.id, { isBuffering: false });
          }}
          onTimeUpdate={(event) => {
            const active = controlRef.current;
            if (active?.type === "video") {
              updateMediaControl(active.id, {
                currentTime: event.currentTarget.currentTime,
                duration: event.currentTarget.duration,
              });
            }
          }}
          onEnded={() => {
            const active = controlRef.current;
            if (!active || active.type !== "video") return;
            updateMediaControl(active.id, { isPlaying: false });
            active.next?.();
          }}
        />
        <iframe
          ref={iframeRef}
          className={`h-full w-full ${isYouTube ? "block" : "hidden"}`}
          title={control?.title || "Lecteur YouTube"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy={YOUTUBE_REFERRER_POLICY}
          allowFullScreen
          onLoad={() => {
            const active = controlRef.current;
            if (active?.type !== "youtube") return;
            updateMediaControl(active.id, { isPlaying: true, isBuffering: false });
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: "chay-player", channel: "chay" }),
              YOUTUBE_ORIGIN
            );
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }),
              YOUTUBE_ORIGIN
            );
          }}
        />
      </div>

      {control && (
        <>
          {isYouTube && <PlayerQueueList queue={control.queue} index={control.queueIndex} />}
          <div className="flex items-center justify-center gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {control.previous && (
              <button type="button" onClick={control.previous} aria-label="Précédent" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><SkipBack /></button>
            )}
            <button type="button" onClick={control.toggle} aria-label={isRadio ? "Arrêter la radio" : control.isPlaying ? "Pause" : "Lecture"} className="grid h-14 w-14 place-items-center rounded-full bg-white text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {isRadio ? <Square /> : control.isPlaying ? <Pause /> : <Play />}
            </button>
            {control.next && (
              <button type="button" onClick={control.next} aria-label="Suivant" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><SkipForward /></button>
            )}
            <button type="button" onClick={() => setExpanded(false)} aria-label="Réduire le lecteur et continuer la lecture" className="grid h-12 w-12 place-items-center rounded-full text-white/70 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X /></button>
          </div>
        </>
      )}
    </motion.div>
  );
}