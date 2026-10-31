import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { RADIO_URL, RADIO_LOGO } from "@/lib/mediaConstants";
import { isRadioMseSupported, startRadioStream } from "@/lib/radioMse";
import { MEDIA_PLAYER_BUFFERING_POLICY, useMediaPlayerState } from "@/hooks/useMediaPlayerState";
import { clearMediaControl, publishMediaControl } from "@/lib/mediaControl";
import {
  isAndroidExoPlayerAvailable,
  playWithAndroidExoPlayer,
  setAndroidExoPlayerVolume,
  stopAndroidExoPlayer,
  subscribeAndroidExoPlayer,
} from "@/lib/androidExoPlayer";

const RadioContext = createContext(null);
export const useRadio = () => useContext(RadioContext);

// Pré-roll adaptatif : on lance le son dès que le tampon contient
// PREROLL_MIN_BUFFER_S secondes (au plus tôt après PREROLL_MIN_MS), avec un
// plafond dur de PREROLL_MAX_MS ms. On augmente le tampon pour les réseaux
// mobiles et les faibles connexions, afin que la lecture reste fluide plus longtemps.
const PREROLL_MAX_MS = MEDIA_PLAYER_BUFFERING_POLICY.radioPrerollMaxMs;
const PREROLL_MIN_MS = 1800;
// MSE : le backlog serveur arrive en bloc ; on laisse plus de marge avant de
// décider que le flux est suffisamment prêt pour démarrer la lecture.
const PREROLL_MIN_BUFFER_S = MEDIA_PLAYER_BUFFERING_POLICY.radioPrerollMinBufferSeconds;
// Lecture MSE disponible (Chrome/Edge et Android). Sinon : chemin <audio>.
const USE_MSE = isRadioMseSupported();
const RESUME_MS = 8000; // délai de reprise après une coupure réseau
// Tolérance avant de déclarer une panne : une coupure courte est fréquente sur
// réseau mobile, donc on attend plus longtemps avant de forcer une reprise.
const RADIO_STALL_MS = MEDIA_PLAYER_BUFFERING_POLICY.radioStallMs;

export const MAX_RADIO_RETRIES = 12;

export function RadioPlayerProvider({ children }) {
  const isNativeAndroidPlayer = isAndroidExoPlayerAvailable();
  const audioRef = useRef(null);
  const [retries, setRetries] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [nativeRadioState, setNativeRadioState] = useState("idle");
  const [nativeRadioError, setNativeRadioError] = useState(null);
  // Volume maximal : la radio suit directement le volume système du téléphone.
  const [volume, setVolumeState] = useState(1);
  const attemptsRef = useRef(0);
  const preRollTimer = useRef(null);
  const prerollPoll = useRef(null);
  const resumeTimer = useRef(null);
  const prevStateRef = useRef("idle");
  // Flux MSE en cours (null en mode repli <audio>).
  const streamRef = useRef(null);
  const mediaControlIdRef = useRef(null);

  // Machine à états partagée — radio en direct (isLive = true).
  const { state: webState, errorCode: webErrorCode } = useMediaPlayerState(audioRef, {
    isLive: true,
    errorTimeoutMs: RADIO_STALL_MS,
  });

  const state = isNativeAndroidPlayer ? nativeRadioState : webState;
  const errorCode = isNativeAndroidPlayer ? nativeRadioError : webErrorCode;
  const isPlaying = state === "playing";
  const isLoading = state === "connecting" || state === "buffering";
  const error = state === "error";

  const clearTimers = () => {
    if (preRollTimer.current) {
      clearTimeout(preRollTimer.current);
      preRollTimer.current = null;
    }
    if (prerollPoll.current) {
      clearInterval(prerollPoll.current);
      prerollPoll.current = null;
    }
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  };

  const stopStream = () => {
    const s = streamRef.current;
    if (!s) return;
    streamRef.current = null;
    try {
      s.stop();
    } catch {}
  };

  // Échec du flux MSE (réseau coupé, flux fermé) : on le remonte comme une
  // erreur du <audio> pour réutiliser la reprise existante (6 s, 12 essais).
  const onStreamFailed = () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.dispatchEvent(new Event("error"));
    } catch {}
  };

  const loadStream = () => {
    const a = audioRef.current;
    stopStream();
    if (isNativeAndroidPlayer) {
      playWithAndroidExoPlayer({
        url: RADIO_URL,
        mediaType: "radio",
        title: "Radio Chay",
        artist: "Radio Chay",
      }).catch((error) => {
        console.error("[RadioPlayer] Unable to start ExoPlayer radio.", error);
        setNativeRadioError(error?.message || "Lecture radio impossible.");
        setNativeRadioState("error");
        setPreparing(false);
      });
      return;
    }
    if (!a) return;
    if (USE_MSE) {
      streamRef.current = startRadioStream(a, RADIO_URL, { onFailed: onStreamFailed });
      if (streamRef.current) return; // on lit nous-mêmes les octets du flux
    }
    a.src = RADIO_URL;
    a.load();
  };

  // Pré-roll adaptatif : on lance le son dès que le tampon contient
  // PREROLL_MIN_BUFFER_S secondes, sans jamais dépasser PREROLL_MAX_MS.
  const beginPreroll = () => {
    clearTimers();
    let done = false;

    const bufferedSeconds = () => {
      try {
        const el = audioRef.current;
        if (!el || !el.buffered.length) return 0;
        return el.buffered.end(el.buffered.length - 1) - el.buffered.start(0);
      } catch {
        return 0;
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearTimers();
      setPreparing(false);
      if (isNativeAndroidPlayer) return;
      const el = audioRef.current;
      if (el) el.play().catch(() => {});
    };

    const startedAt = Date.now();
    prerollPoll.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < PREROLL_MIN_MS) return;
      if (bufferedSeconds() >= PREROLL_MIN_BUFFER_S || elapsed >= PREROLL_MAX_MS) finish();
    }, 200);
    preRollTimer.current = setTimeout(finish, PREROLL_MAX_MS);
  };

  const play = () => {
    const a = audioRef.current;
    if (isNativeAndroidPlayer && (isPlaying || isLoading || preparing)) return;
    if (!isNativeAndroidPlayer && a && !a.paused && !a.ended) return; // déjà en lecture
    clearTimers();
    attemptsRef.current = 0;
    setRetries(0);
    setNativeRadioError(null);
    if (isNativeAndroidPlayer) {
      setNativeRadioState("connecting");
      setPreparing(true);
      loadStream();
      return;
    }
    setPreparing(true);
    loadStream();
    beginPreroll();
  };

  const stop = () => {
    clearTimers();
    setPreparing(false);
    stopStream();
    if (isNativeAndroidPlayer) {
      stopAndroidExoPlayer(RADIO_URL, "radio")
        .catch((error) => console.error("[RadioPlayer] Unable to stop ExoPlayer radio.", error));
      setNativeRadioState("idle");
      setNativeRadioError(null);
    }
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    attemptsRef.current = 0;
    setRetries(0);
  };

  const toggle = () => (isPlaying || isLoading || preparing ? stop() : play());

  const setVolume = (v) => {
    const c = Math.min(1, Math.max(0, v));
    setVolumeState(c);
    if (audioRef.current) audioRef.current.volume = c;
    if (isNativeAndroidPlayer) {
      setAndroidExoPlayerVolume(c).catch((error) => console.error("[RadioPlayer] Unable to set ExoPlayer volume.", error));
    }
  };

  const retryNow = () => {
    clearTimers();
    attemptsRef.current = 0;
    setRetries(0);
    setNativeRadioError(null);
    if (isNativeAndroidPlayer) {
      setNativeRadioState("connecting");
      setPreparing(true);
      loadStream();
      return;
    }
    setPreparing(true);
    loadStream();
    beginPreroll();
  };

  useEffect(() => {
    if (!isNativeAndroidPlayer) return undefined;
    let subscription;
    let isSubscribed = true;
    subscribeAndroidExoPlayer((event) => {
      if (event.source !== RADIO_URL || event.mediaType !== "radio") return;
      setPreparing(false);
      if (event.error) {
        setNativeRadioError(event.error);
        setNativeRadioState("error");
        return;
      }
      setNativeRadioError(null);
      setNativeRadioState(
        event.isBuffering ? "buffering" : event.isPlaying ? "playing" : event.isEnded ? "error" : "paused"
      );
    }).then((handle) => {
      if (isSubscribed) subscription = handle;
      else handle.remove();
    }).catch((error) => {
      console.error("[RadioPlayer] Unable to subscribe to ExoPlayer state.", error);
    });
    return () => {
      isSubscribed = false;
      subscription?.remove();
    };
  }, [isNativeAndroidPlayer]);

  // Reprise après coupure réseau : après un passage à l'erreur, on relance la
  // lecture. Plafonné à 12 tentatives pour éviter une boucle infinie.
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev !== "error" && state === "error" && !preparing) {
      attemptsRef.current += 1;
      setRetries(attemptsRef.current);
      if (attemptsRef.current <= MAX_RADIO_RETRIES) {
        clearTimers();
        resumeTimer.current = setTimeout(() => {
          // Même chemin qu'un démarrage normal : on affiche « Connexion… »
          // et on laisse le tampon se remplir avant de relancer le son.
          setPreparing(true);
          loadStream();
          if (!isNativeAndroidPlayer) beginPreroll();
        }, RESUME_MS);
      }
    }
    prevStateRef.current = state;
  }, [state, isNativeAndroidPlayer]);

  useEffect(() => {
    if (isPlaying || isLoading || preparing) {
      mediaControlIdRef.current = publishMediaControl(
        {
          type: "radio",
          engine: "radio",
          title: "Radio Chay",
          subtitle: isLoading ? "Mise en mémoire tampon" : "Radio Chay",
          artwork: RADIO_LOGO,
          source: RADIO_URL,
          isPlaying: isPlaying || isLoading || preparing,
          isBuffering: isLoading || preparing,
          isLive: true,
          hasPrevious: false,
          hasNext: false,
          queue: [],
          queueIndex: 0,
          toggle: stop,
          play,
          pause: stop,
          stop,
          previous: null,
          next: null,
        },
        "radio"
      );
    } else if (mediaControlIdRef.current) {
      clearMediaControl(mediaControlIdRef.current);
      mediaControlIdRef.current = null;
    }
  }, [isPlaying, isLoading, preparing, stop]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;

    // Interrupteur : toute autre lecture (musique ou vidéo) arrête la radio.
    const onAnyMediaPlay = (e) => {
      const el = e.target;
      if (!el || el === audioRef.current || el.dataset?.chayAnchor) return;
      if (el.tagName === "AUDIO" || el.tagName === "VIDEO") stop();
    };
    document.addEventListener("play", onAnyMediaPlay, true);

    return () => {
      document.removeEventListener("play", onAnyMediaPlay, true);
      clearTimers();
      stopStream();
      a.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    state,
    preparing,
    isPlaying,
    isLoading,
    error,
    errorCode,
    retries,
    volume,
    play,
    stop,
    toggle,
    setVolume,
    retryNow,
  };

  return (
    <RadioContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="auto" className="hidden" />
    </RadioContext.Provider>
  );
}