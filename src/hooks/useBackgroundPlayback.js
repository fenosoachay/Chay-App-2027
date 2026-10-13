import { useEffect } from "react";
import { YOUTUBE_ORIGIN } from "@/lib/youtubeEmbed";

// Lecture écran éteint / app en arrière-plan (comme YouTube Premium).
// Quand la page passe en arrière-plan, le système met en pause l'élément
// <video> ou l'iframe YouTube, ce qui met aussi `isPlaying` à faux. On retient
// donc si l'utilisateur LISAIT au moment où l'écran s'est caché, et on relance
// la lecture tant qu'il n'a pas lui-même appuyé sur pause.
export function useBackgroundPlayback({ active, getVideo, getIframe, isPlaying }) {
  useEffect(() => {
    if (!active) return undefined;

    let wasPlaying = false;

    const resume = () => {
      if (!wasPlaying) return;
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
        wasPlaying = isPlaying();
        // Le système coupe la lecture juste après : on la relance plusieurs fois.
        [100, 400, 1000, 2000].forEach((delay) => setTimeout(resume, delay));
      } else {
        wasPlaying = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const keepAlive = setInterval(() => {
      if (document.visibilityState === "hidden") resume();
    }, 3000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(keepAlive);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}