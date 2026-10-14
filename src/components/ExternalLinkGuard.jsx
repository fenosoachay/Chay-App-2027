import { useEffect } from "react";
import { openExternal } from "@/lib/openExternal";

// Intercepte tous les clics sur des liens vers un autre site (http/https) afin
// d'afficher la confirmation en français de l'application, au lieu du dialogue
// natif du téléphone (« Open External Link? ») qui suit la langue de l'appareil.
export default function ExternalLinkGuard() {
  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
      const a = e.target.closest?.("a[href]");
      if (!a) return;
      let url;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (!/^https?:$/.test(url.protocol)) return;
      if (url.origin === window.location.origin) return;
      if (a.hasAttribute("download")) return;
      e.preventDefault();
      openExternal(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}