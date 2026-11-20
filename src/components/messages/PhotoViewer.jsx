import React, { useRef, useState } from "react";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { X, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import { openExternal } from "@/lib/openExternal";
import { useToast } from "@/components/ui/use-toast";

/**
 * Visionneuse plein écran des photos d'une conversation.
 * - Galerie : défilement entre toutes les photos (flèches, clavier, ou glisser du doigt à gauche / à droite).
 * - Téléchargement direct de la photo affichée.
 */
export default function PhotoViewer({ images, index, onClose }) {
  useBackHandler(true, onClose);
  const { toast } = useToast();
  const [i, setI] = useState(index || 0);
  const [downloading, setDownloading] = useState(false);
  const total = images.length;

  useKeyboardShortcuts(true, {
    Escape: () => onClose(),
    ArrowLeft: () => { if (total > 1) setI((p) => (p - 1 + total) % total); },
    ArrowRight: () => { if (total > 1) setI((p) => (p + 1) % total); },
  });

  const download = async () => {
    const url = images[i];
    // N'ouvre que les URL http(s) — bloque les schémas dangereux (javascript:, data:).
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return;
    }
    try {
      setDownloading(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = `chay_photo_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
    } catch {
      try {
        await openExternal(url);
      } catch (error) {
        toast({
          title: "Impossible d'ouvrir le lien",
          description: error?.message,
          variant: "destructive",
        });
      }
    } finally {
      setDownloading(false);
    }
  };

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
    if (!d || !t || total < 2) return;
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
        className="absolute top-4 right-4 h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fermer"
      >
        <X className="h-6 w-6" />
      </button>
      <button
        className="absolute top-4 left-4 h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-50"
        onClick={(e) => { e.stopPropagation(); download(); }}
        aria-label="Télécharger"
        disabled={downloading}
      >
        {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      </button>

      {total > 1 && (
        <>
          <button
            className="absolute left-2 md:left-6 h-12 w-12 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => go(e, -1)}
            aria-label="Précédent"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            className="absolute right-2 md:right-6 h-12 w-12 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={(e) => go(e, 1)}
            aria-label="Suivant"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}

      <img
        src={images[i]}
        alt="Photo"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg select-none"
      />

      {total > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
          {i + 1} / {total}
        </div>
      )}
    </div>
  );
}