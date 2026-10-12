import { useEffect } from "react";

// Garde l'écran allumé pendant la lecture (API Wake Lock). Désactivé hors ligne,
// à la pause, ou quand le lecteur se ferme. Sans support : ne fait rien.
export function useKeepAwake(active) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) sentinel.release().catch(() => {});
        else lock = sentinel;
      } catch {
        // Refusé (batterie faible, onglet masqué…) : sans conséquence.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock) acquire();
    };
    const onOffline = () => {
      lock?.release().catch(() => {});
      lock = null;
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", acquire);
      lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}