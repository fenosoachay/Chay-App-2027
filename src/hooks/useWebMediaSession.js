import { useEffect, useRef } from "react";
import { syncMediaSessionActions } from "@/lib/mediaSession";

// Fichier WAV silencieux (~0,1 s) : sert d'« ancre » pour que le navigateur
// affiche la carte média système (écran de verrouillage / volet de
// notifications) même quand le son vient d'un iframe YouTube ou d'un flux
// que le navigateur ne considère pas comme un média HTML en lecture.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const mediaSession = () =>
  typeof navigator !== "undefined" && navigator.mediaSession ? navigator.mediaSession : null;

/**
 * Carte média système (navigateur / PWA) : titre, pochette et boutons
 * Précédent / Pause / Suivant, pour musique, prédications, radio, mp4 et
 * YouTube. Toujours active tant qu'un média existe.
 */
export function useWebMediaSession(control, enabled) {
  const controlRef = useRef(control);
  const anchorRef = useRef(null);
  controlRef.current = control;

  const hasControl = Boolean(control);
  const needsAnchor = Boolean(control && (control.engine === "youtube" || control.type === "youtube" || control.isLive));

  // Handlers : posés à chaque changement de média / de file, pour que les
  // boutons Précédent et Suivant n'apparaissent jamais « grisés » à tort.
  useEffect(() => {
    const session = mediaSession();
    if (!enabled || !session) return;
    syncMediaSessionActions(session, controlRef);
  }, [
    enabled,
    control?.id,
    control?.type,
    Boolean(control?.previous),
    Boolean(control?.next),
    Boolean(control?.seek),
    control?.duration,
  ]);

  // Métadonnées (titre, artiste, pochette).
  useEffect(() => {
    const session = mediaSession();
    if (!enabled || !session) return;
    if (!control) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    if (typeof window.MediaMetadata === "function") {
      try {
        session.metadata = new window.MediaMetadata({
          title: control.title || "Média",
          artist: control.subtitle || "CHAY",
          album: control.isLive ? "En direct" : "ÉGLISE CHAY",
          artwork: control.artwork
            ? [96, 192, 256, 512].map((s) => ({ src: control.artwork, sizes: `${s}x${s}` }))
            : [],
        });
      } catch (error) {
        console.warn("[MediaSession] Métadonnées impossibles.", error);
      }
    }
  }, [enabled, control?.id, control?.title, control?.subtitle, control?.artwork, control?.isLive]);

  // État lecture / pause + barre de progression.
  useEffect(() => {
    const session = mediaSession();
    if (!enabled || !session || !control) return;
    session.playbackState = control.isPlaying ? "playing" : "paused";
    try {
      if (control.duration > 0 && Number.isFinite(control.duration)) {
        session.setPositionState({
          duration: control.duration,
          playbackRate: 1,
          position: Math.max(0, Math.min(control.currentTime || 0, control.duration)),
        });
      } else {
        session.setPositionState();
      }
    } catch {
      /* flux en direct ou lecteur sans durée */
    }
  }, [enabled, control?.id, control?.isPlaying, control?.currentTime, control?.duration]);

  // Ancre audio silencieuse pour YouTube / flux sans élément média natif.
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    if (!needsAnchor) {
      if (anchorRef.current) {
        anchorRef.current.pause();
        anchorRef.current.removeAttribute("src");
        anchorRef.current.load();
      }
      return undefined;
    }
    if (!anchorRef.current) {
      const el = document.createElement("audio");
      el.loop = true;
      el.src = SILENT_WAV;
      el.setAttribute("aria-hidden", "true");
      el.dataset.chayAnchor = "true";
      anchorRef.current = el;
    }
    const el = anchorRef.current;
    if (!el.src) el.src = SILENT_WAV;
    if (control?.isPlaying) el.play().catch(() => {});
    else el.pause();
    return undefined;
  }, [enabled, needsAnchor, control?.isPlaying, control?.id]);

  useEffect(() => () => {
    if (anchorRef.current) {
      anchorRef.current.pause();
      anchorRef.current = null;
    }
  }, []);

  return hasControl;
}