import { useEffect, useRef } from "react";

// Appelle onHalfway(trackId) une seule fois par lecture, quand l'écoute atteint
// la moitié du morceau (et non à chaque clic).
export function useHalfwayListen(currentTrack, currentTime, duration, onHalfway) {
  const countedRef = useRef(null);
  const callbackRef = useRef(onHalfway);
  callbackRef.current = onHalfway;
  const trackId = currentTrack?.id ?? null;

  useEffect(() => {
    countedRef.current = null;
  }, [trackId]);

  useEffect(() => {
    if (!trackId || !(duration > 0)) return;
    if (countedRef.current === trackId) return;
    if (currentTime >= duration / 2) {
      countedRef.current = trackId;
      callbackRef.current?.(trackId);
    }
  }, [trackId, currentTime, duration]);
}