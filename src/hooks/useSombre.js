import { useEffect, useState } from "react";

// 1.3.35 : l'appli est-elle en mode sombre ? Lu sur la classe « dark » de <html> (posée par useTheme), et
// suivi quand elle change. Lecture seule : ne touche jamais à la préférence enregistrée.
const lire = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

export default function useSombre() {
  const [sombre, setSombre] = useState(lire);
  useEffect(() => {
    const Observateur = globalThis.MutationObserver;
    if (typeof Observateur === "undefined") return undefined;
    const obs = new Observateur(() => setSombre(lire()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setSombre(lire());
    return () => obs.disconnect();
  }, []);
  return sombre;
}
