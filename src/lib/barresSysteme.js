// 1.4.0 (Android 16, bord à bord) : l'heure, la batterie et la barre de gestes d'Android s'affichent
// par-dessus l'appli. Leur couleur suit ce qui est réellement dessous : icônes claires sur un fond sombre
// (thème sombre, ou page à fond sombre imposé), icônes foncées sur le thème clair.
import * as core from "@capacitor/core";

/** "DARK" = icônes claires (fond sombre) ; "LIGHT" = icônes foncées (fond clair). */
export function styleBarres(doc) {
  const racine = doc?.documentElement;
  if (!racine) return "DARK";
  if (racine.classList.contains("dark")) return "DARK";
  if (doc.querySelector("main.dark")) return "DARK";
  return "LIGHT";
}

let actif = false;

export function suivreBarresSysteme() {
  if (actif || typeof window === "undefined" || typeof document === "undefined") return;
  const { Capacitor } = core;
  if (!Capacitor?.isNativePlatform?.() || Capacitor.getPlatform?.() !== "android") return;
  const SystemBars = core.SystemBars || (core.registerPlugin && core.registerPlugin("SystemBars"));
  if (!SystemBars?.setStyle) return;
  actif = true;
  let dernier = null;
  let prevu = false;
  const appliquer = () => {
    prevu = false;
    const style = styleBarres(document);
    if (style === dernier) return;
    dernier = style;
    SystemBars.setStyle({ style }).catch(() => { dernier = null; });
  };
  const planifier = () => {
    if (prevu) return;
    prevu = true;
    window.requestAnimationFrame(appliquer);
  };
  appliquer();
  new window.MutationObserver(planifier).observe(document.documentElement, { attributes: true, attributeFilter: ["class"], subtree: true });
}
