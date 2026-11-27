import React, { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { useToast } from "@/components/ui/use-toast";
import { enregistrerFond } from "@/lib/fondsEcran";
import { ZOOM_DOUBLE, adresseGrande, bornerEchelle, limiter, photoZoomable, zoomerAutour } from "@/lib/zoomPhoto";

// Toutes les photos de l'app (1.3.23) : toucher une photo l'ouvre en plein écran, où l'on peut zoomer
// (pincer à deux doigts, double-toucher ; molette ou double-clic sur ordinateur) et se déplacer dans la photo.
// Les images qui ont déjà une action (bouton, lien, carte de jeu, vignette de galerie…) ne sont pas concernées :
// voir photoZoomable. Pour exclure une zone : attribut data-sans-zoom.

const INTERACTIF = "button, a, [role='button'], label, summary, input, select, textarea, [contenteditable='true'], [data-sans-zoom]";

/**
 * Photo de profil (1.3.27) : jamais téléchargeable (ni bouton, ni appui long / clic droit « Enregistrer »).
 * Repérée par data-photo-profil (avatars, profil d'un membre), ou par sa forme ronde (avatars des listes).
 */
export function estPhotoProfil(img) {
  if (!img || !img.closest) return false;
  if (img.closest("[data-photo-profil]")) return true;
  let n = img;
  for (let i = 0; i < 3 && n; i += 1, n = n.parentElement) {
    if (n.classList?.contains("rounded-full")) return true;
  }
  return false;
}

/**
 * Photo zoomable (pincer, double-toucher, molette, double-clic) et déplaçable une fois zoomée.
 * 1.3.34 : exportée pour zoomer directement dans les visionneuses (Galerie, Fonds d'écran), sans toucher la photo
 * d'abord. `onZoom(true|false)` : prévient quand la photo est zoomée (le glissement change alors de rôle).
 */
export function ZoomImage({ src, classeImage = "max-h-full max-w-full", onZoom }) {
  const cadre = useRef(null);
  const img = useRef(null);
  const [etat, setEtat] = useState({ s: 1, x: 0, y: 0 });
  const etatRef = useRef(etat);
  const doigts = useRef(new Map()); // pointerId -> { x, y }
  const pincement = useRef(null); // { dist, etat, centre }
  const dernierToucher = useRef({ t: 0, x: 0, y: 0 });
  const [anime, setAnime] = useState(false);
  const dernierBasculement = useRef(0);

  const appliquer = (e, avecAnimation = false) => {
    const c = cadre.current?.getBoundingClientRect();
    const i = img.current;
    const borne = c && i ? limiter(e, i.offsetWidth, i.offsetHeight, c.width, c.height) : e;
    if ((etatRef.current.s > 1) !== (borne.s > 1)) onZoom?.(borne.s > 1);
    etatRef.current = borne;
    setAnime(avecAnimation);
    setEtat(borne);
  };

  // Point de l'écran -> coordonnées relatives au centre du cadre.
  const versCentre = (clientX, clientY) => {
    const c = cadre.current.getBoundingClientRect();
    return { x: clientX - (c.left + c.width / 2), y: clientY - (c.top + c.height / 2) };
  };

  const basculer = (clientX, clientY) => {
    // Un double-toucher produit aussi un « double-clic » : une seule bascule.
    if (Date.now() - dernierBasculement.current < 400) return;
    dernierBasculement.current = Date.now();
    const e = etatRef.current;
    appliquer(e.s > 1 ? { s: 1, x: 0, y: 0 } : zoomerAutour(e, versCentre(clientX, clientY), ZOOM_DOUBLE), true);
  };

  const surPhoto = useRef(false);
  const bas = (ev) => {
    // Le cadre capture le doigt (le « clic » qui suit vise alors le cadre) : on retient s'il a touché la photo.
    surPhoto.current = ev.target === img.current;
    cadre.current?.setPointerCapture?.(ev.pointerId);
    doigts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (doigts.current.size === 2) {
      const [a, b] = [...doigts.current.values()];
      pincement.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        etat: etatRef.current,
        centre: versCentre((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  };

  const bouge = (ev) => {
    const avant = doigts.current.get(ev.pointerId);
    if (!avant) return;
    const apres = { x: ev.clientX, y: ev.clientY };
    doigts.current.set(ev.pointerId, apres);
    if (doigts.current.size >= 2 && pincement.current) {
      const [a, b] = [...doigts.current.values()];
      const p = pincement.current;
      const s2 = bornerEchelle(p.etat.s * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist));
      const centre = versCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const z = zoomerAutour(p.etat, p.centre, s2);
      // Le centre du pincement suit aussi les doigts (déplacement à deux doigts).
      appliquer({ s: z.s, x: z.x + (centre.x - p.centre.x), y: z.y + (centre.y - p.centre.y) });
      return;
    }
    const e = etatRef.current;
    if (e.s > 1) appliquer({ s: e.s, x: e.x + (apres.x - avant.x), y: e.y + (apres.y - avant.y) });
  };

  const haut = (ev) => {
    const debut = doigts.current.get(ev.pointerId);
    doigts.current.delete(ev.pointerId);
    if (doigts.current.size < 2) pincement.current = null;
    if (!debut || ev.pointerType === "mouse") return;
    // Double-toucher : deux touchers rapprochés au même endroit.
    const maintenant = Date.now();
    const d = dernierToucher.current;
    if (maintenant - d.t < 300 && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 40) {
      dernierToucher.current = { t: 0, x: 0, y: 0 };
      basculer(ev.clientX, ev.clientY);
    } else {
      dernierToucher.current = { t: maintenant, x: ev.clientX, y: ev.clientY };
    }
  };

  const molette = (ev) => {
    ev.preventDefault();
    const e = etatRef.current;
    appliquer(zoomerAutour(e, versCentre(ev.clientX, ev.clientY), e.s * Math.exp(-ev.deltaY * 0.0015)));
  };

  // La molette doit pouvoir empêcher le défilement de la page : écouteur non passif.
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    el.addEventListener("wheel", molette, { passive: false });
    return () => el.removeEventListener("wheel", molette);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={cadre}
      className="relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden"
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onPointerCancel={haut}
      onDoubleClick={(ev) => basculer(ev.clientX, ev.clientY)}
      // Toucher la photo ne ferme pas la visionneuse qui la contient ; toucher à côté, si.
      onClick={(ev) => { if (surPhoto.current || ev.target === img.current) ev.stopPropagation(); }}
      style={{ cursor: etat.s > 1 ? "grab" : "zoom-in" }}
    >
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        data-sans-zoom
        className={`${classeImage} object-contain ${anime ? "transition-transform duration-200" : ""}`}
        style={{ transform: `translate(${etat.x}px, ${etat.y}px) scale(${etat.s})` }}
      />
    </div>
  );
}

// 1.3.34 : seuls les fonds d'écran se téléchargent (bouton de Multimédia › Fonds d'écran) : plus de bouton
// « Télécharger » ici, et pas de menu « Enregistrer l'image » à l'appui long sur les photos de l'app.
function Visionneuse({ src, telechargeable = false, onClose }) {
  const { toast } = useToast();
  const [telechargement, setTelechargement] = useState(false);
  const [aide, setAide] = useState(true);
  useBackHandler(true, onClose);
  useKeyboardShortcuts(true, { Escape: () => onClose() });
  useEffect(() => {
    const t = setTimeout(() => setAide(false), 2500);
    return () => clearTimeout(t);
  }, []);

  // Téléchargement : APK -> galerie du téléphone (Images › Chay) ; navigateur -> fichier téléchargé.
  const telecharger = async () => {
    if (!/^https?:\/\//i.test(src)) return;
    setTelechargement(true);
    try {
      const ou = await enregistrerFond({ image_url: src, title: "photo-chay" });
      toast({
        title: ou === "galerie" ? "Photo enregistrée dans la galerie" : "Photo téléchargée",
        description: ou === "galerie" ? "Dossier Images › Chay." : undefined,
      });
    } catch (error) {
      toast({ title: "Téléchargement impossible", description: error?.message, variant: "destructive" });
    } finally {
      setTelechargement(false);
    }
  };

  const bouton = "absolute z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20";
  return (
    // pointerEvents « auto » et pointerdown arrêté : utilisable au-dessus d'une fenêtre (Radix) sans la fermer.
    <div
      className="fixed inset-0 z-[230] bg-black"
      style={{ pointerEvents: "auto" }}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Photo en grand"
      data-sans-zoom
    >
      <ZoomImage src={src} />
      <button type="button" onPointerUp={onClose} onClick={(e) => { if (e.detail === 0) onClose(); }} aria-label="Fermer" className={bouton} style={{ top: "calc(var(--sa-top) + 1rem)", right: "1rem" }}>
        <X className="h-6 w-6" />
      </button>
      {telechargeable && /^https?:\/\//i.test(src) && (
        <button type="button" onClick={telecharger} disabled={telechargement} aria-label="Télécharger" className={`${bouton} disabled:opacity-50`} style={{ top: "calc(var(--sa-top) + 1rem)", left: "1rem" }}>
          {telechargement ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
      )}
      <p
        className={`pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-white/80 transition-opacity duration-500 ${aide ? "opacity-100" : "opacity-0"}`}
        style={{ bottom: "max(2rem, var(--sa-bottom))" }}
      >
        Pincez ou touchez deux fois pour zoomer
      </p>
    </div>
  );
}

export default function VisionneusePhoto() {
  const [src, setSrc] = useState(null);
  const telechargeable = false;

  // Appui long / clic droit sur une photo : pas de menu « Enregistrer l'image » (1.3.34 : toutes les photos ;
  // seuls les fonds d'écran se téléchargent, par leur bouton).
  useEffect(() => {
    const menu = (e) => {
      if (e.target instanceof HTMLImageElement) e.preventDefault();
    };
    document.addEventListener("contextmenu", menu, true);
    return () => document.removeEventListener("contextmenu", menu, true);
  }, []);

  useEffect(() => {
    // Phase de capture : décidé avant les gestionnaires des écrans, qui ne verront pas ce toucher si la photo s'ouvre.
    const clic = (e) => {
      const cible = e.target;
      if (!(cible instanceof HTMLImageElement) || e.button > 0) return;
      const r = cible.getBoundingClientRect();
      const ok = photoZoomable({
        interactif: Boolean(cible.closest(INTERACTIF)),
        curseur: getComputedStyle(cible).cursor,
        largeur: r.width,
        hauteur: r.height,
        src: cible.currentSrc || cible.src,
      });
      if (!ok) return;
      e.preventDefault();
      e.stopPropagation();
      setSrc(adresseGrande(cible.currentSrc || cible.src));
    };
    document.addEventListener("click", clic, true);
    return () => document.removeEventListener("click", clic, true);
  }, []);

  return src ? <Visionneuse src={src} telechargeable={telechargeable} onClose={() => setSrc(null)} /> : null;
}
