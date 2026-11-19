import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Film, Pause, Play, Radio, SkipBack, SkipForward, Square, X, Loader2, Maximize, Minimize, RotateCcw, RotateCw } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useBackHandler } from "@/hooks/useBackHandler";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useBackgroundPlayback } from "@/hooks/useBackgroundPlayback";
import { useNetwork } from "@/lib/NetworkContext";
import { toast } from "@/components/ui/use-toast";
import PlayerQueueList from "@/components/player/PlayerQueueList";
import OfflinePlayerNotice from "@/components/player/OfflinePlayerNotice";
import {
  DELAI_RELAIS_MS,
  lecteurYoutube,
  messageErreurYoutube,
  YOUTUBE_ORIGIN,
  YOUTUBE_REFERRER_POLICY,
} from "@/lib/youtubeEmbed";
import { PB_PUBLIC_APP_URL } from "@/api/backendConfig";
import {
  clearMediaControl,
  subscribeMediaControl,
  subscribeMediaPlaybackRequests,
  surfaceHandlersMissing,
  updateMediaControl,
} from "@/lib/mediaControl";
import {
  isAndroidExoPlayerAvailable,
  pauseAndroidExoPlayer,
  playWithAndroidExoPlayer,
  resumeAndroidExoPlayer,
  seekAndroidExoPlayer,
  setAndroidExoPlayerFullscreen,
  setAndroidExoPlayerVideoBounds,
  stopAndroidExoPlayer,
  subscribeAndroidExoPlayer,
  subscribeAndroidExoPlayerFullscreen,
} from "@/lib/androidExoPlayer";
import { isActiveVideoEvent, videoQueueId } from "@/lib/videoPlaybackEvent";
import {
  allowsFullPlayer,
  classeVideoLecteur,
  doitArreterYoutubeReduit,
  isAudioControl,
  opensFullPlayerOnRequest,
  youtubeWatchUrl,
} from "@/lib/mediaSurfaceRules";
import { Capacitor } from "@capacitor/core";
import { openExternal } from "@/lib/openExternal";

// YouTube : iframe directe sur le site ; dans l'APK Android, page relais sur membres.chay.fr (vrai domaine).
const LECTEUR_YT = lecteurYoutube({
  platform: Capacitor.getPlatform(),
  pageOrigin: typeof window !== "undefined" ? window.location.origin : "",
  relaisBase: PB_PUBLIC_APP_URL,
});
// Relais mal configuré : origine de repli (les messages vers une iframe vide sont simplement ignorés).
const ORIGINE_YT = LECTEUR_YT.origin || YOUTUBE_ORIGIN;


// Part du média déjà téléchargée (0 → 1), pour la barre de progression.
const computeBufferedRatio = (el) => {
  try {
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return 0;
    const buffered = el.buffered;
    if (!buffered || !buffered.length) return 0;
    return Math.max(0, Math.min(1, buffered.end(buffered.length - 1) / el.duration));
  } catch {
    return 0;
  }
};

const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export default function UniversalMediaSurface() {
  const isNativeAndroidPlayer = isAndroidExoPlayerAvailable();
  const [control, setControl] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Buffering natif (<video>) : suivi via les événements waiting / playing.
  // `videoWaiting` ne concerne QUE la balise <video>, ce qui évite qu'un
  // contrôle lancé avec `isBuffering: true` affiche un spinner avant même que
  // le lecteur ait commencé à charger (double indicateur de chargement).
  const [videoWaiting, setVideoWaiting] = useState(false);
  // Premières images réellement décodées : sert à retirer le poster de
  // couverture (évite un flash de poster sur une vidéo déjà prête).
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const controlRef = useRef(null);
  const previousControlRef = useRef(null);
  controlRef.current = control;
  const youtubePlayingRef = useRef(false);
  // Échec de lecture intégrée ({ source, code }) : message + « Ouvrir dans YouTube ».
  const [erreurYoutube, setErreurYoutube] = useState(null);
  const relaisDelaiRef = useRef(null);
  useEffect(() => () => clearTimeout(relaisDelaiRef.current), []);
  // Source réellement chargée dans <video> : sert d'idempotence pour éviter
  // deux rechargements consécutifs de la même vidéo.
  const loadedSrcRef = useRef(null);

  useEffect(() => subscribeMediaControl(setControl), []);

  const playYouTube = (source) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const url = LECTEUR_YT.url(source);
    clearTimeout(relaisDelaiRef.current);
    if (!url) {
      const active = controlRef.current;
      if (active?.type === "youtube") {
        updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
        if (LECTEUR_YT.relais && source) setErreurYoutube({ source, code: "relais" });
      }
      return;
    }
    setErreurYoutube(null);
    if (iframe.src !== url) iframe.src = url;
    youtubePlayingRef.current = true;
    // APK : si la page relais ne répond pas (hors ligne, page absente, en-têtes bloquants) -> repli.
    if (LECTEUR_YT.relais) {
      relaisDelaiRef.current = setTimeout(() => {
        if (controlRef.current?.type !== "youtube") return;
        setErreurYoutube({ source, code: "delai" });
        updateMediaControl(controlRef.current.id, { isPlaying: false, isBuffering: false });
      }, DELAI_RELAIS_MS);
    }
  };

// Charge et lit une vidéo dans l'élément <video> persistant.
// Contraintes corrigées ici :
//  - pas de `setTimeout` : le chargement démarre immédiatement (le délai
//    artificiel de 100 ms ajoutait 100 ms à CHAQUE démarrage, et faisait
//    courir la course avec l'autre appel de playVideo → deux « loading ») ;
//  - idempotence stricte : rejouer la même source ne provoque AUCUN
//    rechargement réseau (il suffit de reprendre la lecture) ;
//  - `preload="auto"` + `play()` appelé tout de suite : le navigateur peut
//    démarrer le décodage dès les premières bytes, au lieu d'attendre
//    `metadata` comme avant.
const playVideo = (source) => {
  if (isNativeAndroidPlayer) {
    const active = controlRef.current;
    if (!active || active.type !== "video" || !source) return;
    setVideoWaiting(true);
    playWithAndroidExoPlayer({
      url: source,
      mediaType: "video",
      // Identifiant transmis par la session média même quand l'adresse ne l'est pas (événements à source vide).
      queueId: videoQueueId(active.id),
      title: active.title || "Film",
      artist: active.subtitle || "Film",
    }).catch((error) => {
    if (controlRef.current?.source !== source) return;
    console.error("[MediaPlayer] Unable to start ExoPlayer video.", error);
      setVideoWaiting(false);
      updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
      toast({
        title: "Lecture impossible",
        description: error?.message || "Cette vidéo n'a pas pu être ouverte.",
        variant: "destructive",
      });
    });
    return;
  }

  const video = videoRef.current;
  if (!video || !source) return;

  const sameSource = loadedSrcRef.current === source && Boolean(video.currentSrc);

  if (!sameSource) {
    loadedSrcRef.current = source;
    setVideoWaiting(true);
    // Changement de média : on remplace la source sans passer par
    // `removeAttribute("src") + load()`, qui annule le téléchargement en
    // cours puis repart de zéro.
    video.src = source;
    video.load();
  }

  if (video.paused) {
    video.play().catch(() => {
      // Échec de lecture auto (politique navigateur / réseau) : on repart sur
      // un état propre pour que le bouton ▶ du lecteur reste cohérent.
      setVideoWaiting(false);
      const active = controlRef.current;
      if (active?.type === "video") {
        updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
      }
    });
  }
};

  useEffect(() => subscribeMediaPlaybackRequests((requested) => {
    if (requested.type === "video") playVideo(requested.source);
    else if (requested.type === "youtube") playYouTube(requested.source);
    // La radio se joue sur sa page : pas de plein écran (voir mediaSurfaceRules).
    if (opensFullPlayerOnRequest(requested.type)) setExpanded(true);
  }), []);

  useEffect(() => {
    if (!isNativeAndroidPlayer) return undefined;
    let subscription;
    let isSubscribed = true;
    subscribeAndroidExoPlayer((event) => {
      const activeControl = controlRef.current;
      // Vidéo reconnue par son queueId (la source peut arriver vide via la session média) ou par sa source.
      if (!isActiveVideoEvent(event, activeControl)) return;
      setVideoWaiting(Boolean(event.isBuffering));
      updateMediaControl(activeControl.id, {
        isPlaying: Boolean(event.isPlaying),
        isBuffering: Boolean(event.isBuffering),
        currentTime: Number(event.currentTime) || 0,
        duration: Number(event.duration) || 0,
        bufferedRatio: Number(event.bufferedRatio) || 0,
      });
      if (event.error) {
        setVideoWaiting(false);
        toast({
          title: "Lecture impossible",
          description: event.error,
          variant: "destructive",
        });
      }
      if (event.isEnded) {
        setVideoWaiting(false);
        activeControl.next?.();
      }
    }).then((handle) => {
      if (isSubscribed) subscription = handle;
      else handle.remove();
    }).catch((error) => {
      console.error("[MediaPlayer] Unable to subscribe to ExoPlayer state.", error);
    });
    return () => {
      isSubscribed = false;
      subscription?.remove();
    };
  }, [isNativeAndroidPlayer]);

  useEffect(() => {
    if (!control) {
      if (isNativeAndroidPlayer && previousControlRef.current?.type === "video") {
        stopAndroidExoPlayer(previousControlRef.current.source, "video")
          .catch((error) => console.error("[MediaPlayer] Unable to stop ExoPlayer video.", error));
      }
      videoRef.current?.pause();
      if (videoRef.current) {
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      loadedSrcRef.current = null;
      if (iframeRef.current) iframeRef.current.src = "about:blank";
      youtubePlayingRef.current = false;
      setExpanded(false);
      setVideoWaiting(false);
      previousControlRef.current = control;
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
    }
    previousControlRef.current = control;
  }, [control?.id, control?.source, control?.type, isNativeAndroidPlayer]);

  const handlersMissing = surfaceHandlersMissing(control);
  useEffect(() => {
    if (!control || isAudioControl(control)) return undefined;
    const id = control.id;
    const currentControl = control;
    const toggle = () => {
      const active = controlRef.current;
      if (!active || active.id !== id) return;
      if (active.type === "video") {
        if (isNativeAndroidPlayer) {
          const command = active.isPlaying ? pauseAndroidExoPlayer : resumeAndroidExoPlayer;
          command().catch((error) => console.error("[MediaPlayer] Unable to toggle ExoPlayer video.", error));
          return;
        }
        const video = videoRef.current;
        if (video?.paused) video.play().catch(() => {});
        else video?.pause();
      } else if (active.type === "youtube") {
        const command = youtubePlayingRef.current ? "pauseVideo" : "playVideo";
        youtubePlayingRef.current = !youtubePlayingRef.current;
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: command, args: [] }),
          ORIGINE_YT
        );
        updateMediaControl(id, { isPlaying: youtubePlayingRef.current });
      } else {
        active.toggle?.();
      }
    };
    const stop = () => {
      if (currentControl.type === "video") {
        if (isNativeAndroidPlayer) {
          stopAndroidExoPlayer(currentControl.source, "video")
            .catch((error) => console.error("[MediaPlayer] Unable to stop ExoPlayer video.", error));
        }
        const video = videoRef.current;
        video?.pause();
        if (video) {
          video.removeAttribute("src");
          video.load();
        }
      } else if (currentControl.type === "youtube") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "stopVideo", args: [] }),
          ORIGINE_YT
        );
        if (iframeRef.current) iframeRef.current.src = "about:blank";
        youtubePlayingRef.current = false;
      } else {
        currentControl.stop?.();
      }
      clearMediaControl(id);
    };
    const seek = (time) => {
      if (currentControl.type === "video" && isNativeAndroidPlayer) {
        seekAndroidExoPlayer(time).catch((error) => console.error("[MediaPlayer] Unable to seek ExoPlayer video.", error));
      } else if (currentControl.type === "video" && videoRef.current) {
        videoRef.current.currentTime = time;
      } else if (currentControl.type === "youtube") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "seekTo", args: [time, true] }),
          ORIGINE_YT
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
    // La page Films republie le même contrôle (même identifiant) avec toggle / seek à null : sans cette
    // dépendance, les commandes ne seraient pas remises et le bouton lecture/pause ne ferait plus rien.
  }, [control?.id, control?.type, isNativeAndroidPlayer, handlersMissing]);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== ORIGINE_YT) return;
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      const active = controlRef.current;
      if (active?.type !== "youtube") return;
      if (data?.event === "ready") {
        clearTimeout(relaisDelaiRef.current);
        return;
      }
      if (data?.event === "onError") {
        clearTimeout(relaisDelaiRef.current);
        setErreurYoutube({ source: active.source, code: data.info });
        updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
        return;
      }
      if (data?.event === "onStateChange") {
        clearTimeout(relaisDelaiRef.current);
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

  const isFullPlayer = expanded && allowsFullPlayer(control);

  // YouTube réduit (croix, retour) : arrêt, au lieu d'un lecteur caché qui continue de jouer le son.
  const youtubeAfficheRef = useRef(false);
  useEffect(() => {
    if (doitArreterYoutubeReduit(control, youtubeAfficheRef.current, isFullPlayer)) {
      if (typeof control.stop === "function") control.stop();
      else clearMediaControl(control.id);
    }
    youtubeAfficheRef.current = Boolean(isFullPlayer && control?.type === "youtube");
  }, [isFullPlayer, control]);

  const isVideo = control?.type === "video";
  const isYouTube = control?.type === "youtube";
  const isRadio = control?.type === "radio";

  // ── Plein écran vidéo (téléphone Android) : paysage, commandes du lecteur Android. ──
  const [pleinEcran, setPleinEcran] = useState(false);
  const basculerPleinEcran = (actif) => {
    setPleinEcran(actif);
    setAndroidExoPlayerFullscreen(actif).catch((error) => {
      console.error("[MediaPlayer] Unable to toggle fullscreen.", error);
      setPleinEcran(false);
    });
  };
  useEffect(() => {
    if (!isNativeAndroidPlayer) return undefined;
    const abonnement = subscribeAndroidExoPlayerFullscreen((e) => {
      if (!e?.active) setPleinEcran(false);
    });
    return () => { Promise.resolve(abonnement).then((a) => a?.remove?.()).catch(() => {}); };
  }, [isNativeAndroidPlayer]);
  // Bouton retour : quitte le plein écran (avant de fermer le lecteur).
  useBackHandler(pleinEcran, () => basculerPleinEcran(false));
  // Lecteur réduit ou autre média : on sort du plein écran.
  useEffect(() => {
    if (pleinEcran && (!isFullPlayer || !isVideo)) basculerPleinEcran(false);
  }, [isFullPlayer, isVideo]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Plein écran sur ordinateur : tout le lecteur (vidéo + boutons), pas seulement la vidéo du navigateur. ──
  const racineRef = useRef(null);
  const [pleinEcranWeb, setPleinEcranWeb] = useState(false);
  useEffect(() => {
    if (isNativeAndroidPlayer) return undefined;
    const suivre = () => setPleinEcranWeb(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, [isNativeAndroidPlayer]);
  const basculerPleinEcranWeb = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else racineRef.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    if (pleinEcranWeb && (!isFullPlayer || !isVideo)) document.exitFullscreen?.().catch(() => {});
  }, [isFullPlayer, isVideo, pleinEcranWeb]);

  const deplacerVideo = (ecart) => {
    if (!control) return;
    // Web : lecteur <video> de la page.
    if (!isNativeAndroidPlayer) {
      const v = videoRef.current;
      if (!v) return;
      const fin = Number.isFinite(v.duration) ? v.duration : Infinity;
      v.currentTime = Math.max(0, Math.min(fin, (v.currentTime || 0) + ecart));
      return;
    }
    const fin = Math.max(0, Number(control.duration) || 0);
    const position = Math.max(0, Math.min(fin || Infinity, (Number(control.currentTime) || 0) + ecart));
    updateMediaControl(control.id, { currentTime: position });
    seekAndroidExoPlayer(position).catch((error) => console.error("[MediaPlayer] Unable to seek ExoPlayer video.", error));
  };
  // Clavier (ordinateur) : ← recule et → avance de 10 secondes pendant un film.
  const deplacerRef = useRef(null);
  deplacerRef.current = deplacerVideo;
  useEffect(() => {
    if (isNativeAndroidPlayer || !(isFullPlayer && isVideo)) return undefined;
    const touche = (e) => {
      const cible = e.target;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); deplacerRef.current?.(-10); }
      if (e.key === "ArrowRight") { e.preventDefault(); deplacerRef.current?.(10); }
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, [isNativeAndroidPlayer, isFullPlayer, isVideo]);

  const { isOnline } = useNetwork();
  const [retryTick, setRetryTick] = useState(0);
  const blockedOffline = Boolean(isYouTube && !isOnline);
  const showEmbeddedPlayer = Boolean(isFullPlayer && (isVideo || isYouTube) && !blockedOffline);

  useEffect(() => {
    if (!isNativeAndroidPlayer) return undefined;
    const updateBounds = () => {
      const rect = videoRef.current?.getBoundingClientRect();
      const visible = Boolean(showEmbeddedPlayer && isVideo && rect && rect.width > 0 && rect.height > 0);
      setAndroidExoPlayerVideoBounds({
        visible,
        left: visible ? rect.left : 0,
        top: visible ? rect.top : 0,
        width: visible ? rect.width : 0,
        height: visible ? rect.height : 0,
        viewportWidth: window.innerWidth,
      }).catch((error) => console.error("[MediaPlayer] Unable to position ExoPlayer video.", error));
    };
    let frame = window.requestAnimationFrame(updateBounds);
    const observer = videoRef.current && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(updateBounds);
        })
      : null;
    if (videoRef.current) observer?.observe(videoRef.current);
    window.addEventListener("resize", updateBounds);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
      setAndroidExoPlayerVideoBounds({
        visible: false,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        viewportWidth: window.innerWidth,
      }).catch((error) => console.error("[MediaPlayer] Unable to hide ExoPlayer video.", error));
    };
  }, [control?.id, control?.source, expanded, isNativeAndroidPlayer, isVideo, showEmbeddedPlayer]);

  // ── Indicateur de chargement UNIQUE pour la vidéo ────────────────────────
  // Source de vérité : les événements natifs de <video> (`waiting` / `playing`
  // / `canplay`), et non plus le champ `isBuffering` posé par l'appelant.
  // L'ancien calcul superposait deux spinners (celui-ci, jamais câblé, et celui
  // branché sur `control.isBuffering`) et pouvait rester bloqué si un média
  // était publié avec `isBuffering: true` sans événement vidéo correspondant.
  const showVideoSpinner = Boolean(isVideo && videoWaiting);
  useBackHandler(Boolean(isFullPlayer), () => setExpanded(false));
  // L'écran doit rester allumé dès qu'un film est en cours (et pas seulement
  // pour YouTube) : sinon la vidéo se met en pause au bout de 30 s d'écran éteint.
  useKeepAwake(Boolean((isVideo || isYouTube) && control?.isPlaying && (isNativeAndroidPlayer || isOnline)));

  useBackgroundPlayback({
    active: Boolean(control && (isVideo || isYouTube) && !isNativeAndroidPlayer),
    getVideo: () => videoRef.current,
    getIframe: () => iframeRef.current,
    isPlaying: () => Boolean(controlRef.current?.isPlaying),
  });

  useEffect(() => {
    if (isOnline && isYouTube && control?.source) playYouTube(control.source);
  }, [isOnline, retryTick]); 

  return (
    <motion.div
      initial={false}
      animate={{ opacity: isFullPlayer ? 1 : 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal={Boolean(isFullPlayer)}
      aria-label={control ? `Lecteur : ${control.title}` : "Lecteur multimédia"}
      aria-hidden={!isFullPlayer}
      ref={racineRef}
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
        className={`mx-auto w-full overflow-hidden rounded-xl bg-black relative ${
          showEmbeddedPlayer
            ? pleinEcranWeb && isVideo
              ? "my-auto aspect-video max-w-[min(100%,calc((100vh-9rem)*16/9))]"
              : "my-auto aspect-video max-w-5xl"
            : "max-w-5xl pointer-events-none fixed bottom-0 right-0 h-[200px] w-[320px] opacity-0"
        }`}
        aria-hidden={!showEmbeddedPlayer}
      >
        {/* Conteneur positionné : permet de superposer le poster custom et
            l'indicateur de buffering custom au-dessus des contrôles natifs. */}
        <div className="relative h-full w-full">
        <video
  ref={videoRef}
          className={`h-full w-full bg-black object-contain ${classeVideoLecteur({ isNativeAndroidPlayer, isVideo })}`}
  playsInline
          controls={showEmbeddedPlayer && isVideo && !isNativeAndroidPlayer}
  controlsList="nodownload nofullscreen"
  disablePictureInPicture
  // Chargement immédiat : "metadata" faisait attendre le navigateur avant
  // d'amorcer le téléchargement des premières images → démarrage perçu lent.
  preload="auto"
  // Image de couverture native : masque le fond noir pendant le chargement.
  poster={!videoReady && isVideo ? control?.artwork || "" : undefined}
  onPlay={() => {
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isPlaying: true });
  }}
  onPause={() => {
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
  }}
  onWaiting={() => {
    setVideoWaiting(true);
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isBuffering: true });
  }}
  onPlaying={() => {
    // La lecture reprend réellement : plus aucun indicateur de chargement.
    setVideoReady(true);
    setVideoWaiting(false);
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isBuffering: false, isPlaying: true });
  }}
  onCanPlay={() => {
    setVideoWaiting(false);
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isBuffering: false });
  }}
  onLoadedData={() => {
    setVideoReady(true);
    setVideoWaiting(false);
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isBuffering: false });
  }}
  onError={() => {
    // Source injoignable / format non supporté : on stoppe net au lieu de
    // laisser tourner un spinner éternel.
    setVideoWaiting(false);
    setVideoReady(false);
    const active = controlRef.current;
    if (active?.type === "video") {
      updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
      toast({
        title: "Lecture impossible",
        description: "Cette vidéo n'a pas pu être chargée. Vérifiez votre connexion et réessayez.",
        variant: "destructive",
      });
    }
  }}
  onStalled={() => {
    setVideoWaiting(true);
    const active = controlRef.current;
    if (active?.type === "video") updateMediaControl(active.id, { isBuffering: true });
  }}
  onTimeUpdate={(event) => {
    const active = controlRef.current;
    if (active?.type !== "video") return;
    const el = event.currentTarget;
    if (Number.isFinite(el.currentTime) && el.currentTime > 0) setVideoReady(true);
    updateMediaControl(active.id, {
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : active.duration || 0,
      bufferedRatio: computeBufferedRatio(el),
    });
  }}
  onEnded={() => {
    const active = controlRef.current;
    if (!active || active.type !== "video") return;
    updateMediaControl(active.id, { isPlaying: false, isBuffering: false });
    setVideoWaiting(false);
    setVideoReady(false);
    loadedSrcRef.current = null;
    active.next?.();
  }}
  style={{ 
    WebkitUserSelect: 'none',
    userSelect: 'none'
  }}
/>
        
        {/* INDICATEUR DE BUFFERING : source unique (events natifs <video>). */}
        {showVideoSpinner && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <Loader2 className="h-12 w-12 animate-spin text-white" aria-hidden="true" />
            <span className="sr-only">Chargement de la vidéo…</span>
          </div>
        )}

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
              ORIGINE_YT
            );
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }),
              ORIGINE_YT
            );
          }}
        />

        {/* Lecture intégrée impossible (intégration interdite par la chaîne, vidéo absente, relais injoignable). */}
        {isYouTube && erreurYoutube && erreurYoutube.source === control?.source && (
          <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
            <p className="max-w-sm text-sm text-white/85">{messageErreurYoutube(erreurYoutube.code)}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => playYouTube(control.source)}
                className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold"
              >
                Réessayer
              </button>
              <button
                type="button"
                onClick={() => {
                  openExternal(youtubeWatchUrl(control.source)).catch((error) => {
                    console.error("[MediaPlayer] Impossible d'ouvrir la vidéo dans YouTube.", error);
                  });
                }}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold"
              >
                Ouvrir dans YouTube
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {control && (
        <>
          {isNativeAndroidPlayer && isVideo && showEmbeddedPlayer && (
            <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-1 text-xs text-white/75">
              <span className="w-10 text-right tabular-nums">{formatTime(control.currentTime)}</span>
              <input
                type="range"
                min="0"
                max={Math.max(1, Number(control.duration) || 0)}
                step="1"
                value={Math.min(Number(control.currentTime) || 0, Math.max(1, Number(control.duration) || 0))}
                aria-label="Position de la vidéo"
                className="h-1 min-w-0 flex-1 accent-white"
                onChange={(event) => {
                  const position = Number(event.target.value);
                  updateMediaControl(control.id, { currentTime: position });
                  seekAndroidExoPlayer(position).catch((error) => {
                    console.error("[MediaPlayer] Unable to seek ExoPlayer video.", error);
                  });
                }}
              />
              <span className="w-10 tabular-nums">{formatTime(control.duration)}</span>
            </div>
          )}
          {isYouTube && <PlayerQueueList queue={control.queue} index={control.queueIndex} />}
          <div className="flex items-center justify-center gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {isVideo && showEmbeddedPlayer && (
              <button type="button" onClick={() => deplacerVideo(-10)} aria-label="Reculer de 10 secondes" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><RotateCcw /></button>
            )}
            {control.previous && (
              <button type="button" onClick={control.previous} aria-label="Précédent" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><SkipBack /></button>
            )}
            <button type="button" onClick={control.toggle} aria-label={isRadio ? "Arrêter la radio" : control.isPlaying ? "Pause" : "Lecture"} className="grid h-14 w-14 place-items-center rounded-full bg-white text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {isRadio ? <Square /> : control.isPlaying ? <Pause /> : <Play />}
            </button>
            {control.next && (
              <button type="button" onClick={control.next} aria-label="Suivant" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><SkipForward /></button>
            )}
            {isVideo && showEmbeddedPlayer && (
              <button type="button" onClick={() => deplacerVideo(10)} aria-label="Avancer de 10 secondes" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><RotateCw /></button>
            )}
            {!isNativeAndroidPlayer && isVideo && showEmbeddedPlayer && (
              <button type="button" onClick={basculerPleinEcranWeb} aria-label={pleinEcranWeb ? "Quitter le plein écran" : "Plein écran"} className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{pleinEcranWeb ? <Minimize /> : <Maximize />}</button>
            )}
            {isNativeAndroidPlayer && isVideo && showEmbeddedPlayer && (
              <>
                <button type="button" onClick={() => basculerPleinEcran(true)} aria-label="Plein écran" className="grid h-12 w-12 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Maximize /></button>
              </>
            )}
            <button type="button" onClick={() => setExpanded(false)} aria-label="Réduire le lecteur et continuer la lecture" className="grid h-12 w-12 place-items-center rounded-full text-white/70 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X /></button>
          </div>
        </>
      )}
    </motion.div>
  );
}