import { useEffect } from "react";
import { YOUTUBE_ORIGIN } from "@/lib/youtubeEmbed";

// Lecture écran éteint / app en arrière-plan (comme YouTube Premium).
// Quand la page passe en arrière-plan, le système met en pause l'élément
// <video> ou l'iframe YouTube : on relance aussitôt la lecture tant que
// l'utilisateur n'a pas lui-même mis en pause.
export function useBackgroundPlayback({ active, getVideo, getIframe, isPlaying }) {
  useEffect(() => {
    if (!active) return undefined;

    const resume = () => {
      if (!isPlaying()) return;
      const video = getVideo();
      if (video && video.paused && video.getAttribute("src")) {
        video.play().catch(() => {});
      }
      getIframe()?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        YOUTUBE_ORIGIN
      );
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Le système coupe la lecture juste après : on la relance plusieurs fois.
        [150, 600, 1500].forEach((delay) => setTimeout(resume, delay));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const keepAlive = setInterval(() => {
      if (document.visibilityState === "hidden") resume();
    }, 4000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(keepAlive);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}