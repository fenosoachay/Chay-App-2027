import React, { useRef, useState } from "react";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import { ZoomImage } from "@/components/VisionneusePhoto";

/**
 * Visionneuse plein écran des photos d'une conversation.
 * - Galerie : défilement entre toutes les photos (flèches, clavier, ou glisser du doigt à gauche / à droite).
 * - 1.3.34 : on zoome directement (pincer, double-toucher) ; pas de téléchargement (seuls les fonds d'écran).
 */
export default function PhotoViewer({ images, index, onClose }) {
  useBackHandler(true, onClose);
  const [i, setI] = useState(index || 0);
  const [zoome, setZoome] = useState(false);
  const total = images.length;

  useKeyboardShortcuts(true, {
    Escape: () => onClose(),
    ArrowLeft: () => { if (total > 1) setI((p) => (p - 1 + total) % total); },
    ArrowRight: () => { if (total > 1) setI((p) => (p + 1) % total); },
  });

  const go = (e, dir) => {
    e.stopPropagation();
    setI((p) => (p + dir + total) % total);
  };

  // Glisser du doigt : vers la gauche = photo suivante, vers la droite = précédente (geste surtout horizontal).
  const debut = useRef(null);
  const aGlisse = useRef(false);
  const toucherDebut = (e) => {
    const t = e.touches[0];
    debut.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const toucherFin = (e) => {
    const d = debut.current;
    debut.current = null;
    const t = e.changedTouches[0];
    if (!d || !t || total < 2 || zoome) return; // photo zoomée : le doigt déplace la photo
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    aGlisse.current = true; // le « clic » qui suit le geste ne doit pas fermer la visionneuse
    setTimeout(() => { aGlisse.current = false; }, 400);
    setI((p) => (p + (dx < 0 ? 1 : -1) + total) % total);
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center touch-pan-y"
      onClick={() => { if (!aGlisse.current) onClose(); }}
      onTouchStart={toucherDebut}
      onTouchEnd={toucherFin}
    >
      <button
        className="absolute z-10 top-4 right-4 h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fermer"
      >
        <X className="h-6 w-6" />
      </button>
      {total > 1 && (
        <>
          <button
            className="absolute z-10 left-2 md:left-6 h-12 w-12 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => go(e, -1)}
            aria-label="Précédent"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            className="absolute z-10 right-2 md:right-6 h-12 w-12 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => go(e, 1)}
            aria-label="Suivant"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}

      <div className="absolute inset-0">
        <ZoomImage key={images[i]} src={images[i]} classeImage="max-w-[92vw] max-h-[82vh] rounded-lg" onZoom={setZoome} />
      </div>

      {total > 1 && (
        <div className="absolute z-10 bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
          {i + 1} / {total}
        </div>
      )}
    </div>
  );
}
