import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Headphones, Play, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { finDuTexte, histoireDe, libelleFin, MESSAGE_SANS_HISTOIRE } from "@/lib/histoireVerset";

// Petite Histoire du verset du jour (1.3.22), ouverte en touchant le verset sur l'accueil.
// Vidéo, audio ou texte ajouté par l'admin ; le bouton « Vu / Entendu / Lu » ne s'active qu'à la fin (vidéo ou
// audio terminés, texte lu jusqu'en bas) : c'est lui seul qui fait qu'elle ne revient plus. Sans histoire :
// « Une petite histoire vous attend la prochaine fois. » avec « OK ».
export default function HistoireVerset({ devotional, open, onOpenChange, onTermine }) {
  const histoire = histoireDe(devotional);
  const [fini, setFini] = useState(false);
  const texteRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFini(!histoire); // sans histoire : « OK » tout de suite
  }, [open, devotional?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Texte court (sans défilement) : il est lu dès qu'il est affiché.
  useEffect(() => {
    if (!open || histoire?.type !== "texte") return undefined;
    const t = setTimeout(() => {
      const el = texteRef.current;
      if (el && finDuTexte(el)) setFini(true);
    }, 300);
    return () => clearTimeout(t);
  }, [open, histoire?.type]);

  const Icone = histoire?.type === "video" ? Play : histoire?.type === "audio" ? Headphones : histoire ? BookOpen : Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-[1.5rem] p-0">
        <div className="flex max-h-[90vh] flex-col">
          <div className="brand-gradient px-5 pb-4 pt-5 text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <Icone className="h-3.5 w-3.5" /> Petite histoire
            </div>
            <DialogTitle className="mt-2 font-display text-xl font-extrabold text-white">
              {histoire?.titre || devotional?.scripture_reference || "Verset du jour"}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-white/80">
              {devotional?.scripture_reference ? `Autour de ${devotional.scripture_reference}` : "Autour du verset du jour"}
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-5">
            {!histoire && (
              <p className="py-6 text-center text-base font-semibold">{MESSAGE_SANS_HISTOIRE}</p>
            )}
            {histoire?.type === "video" && (
              <video
                src={histoire.url}
                controls
                playsInline
                preload="metadata"
                onEnded={() => setFini(true)}
                className="max-h-[55vh] w-full rounded-xl bg-black"
              />
            )}
            {histoire?.type === "audio" && (
              <div className="py-4">
                <audio src={histoire.url} controls preload="metadata" onEnded={() => setFini(true)} className="w-full" />
                {!fini && <p className="mt-3 text-center text-xs text-foreground/50">Écoute jusqu'au bout pour continuer.</p>}
              </div>
            )}
            {histoire?.type === "texte" && (
              <div
                ref={texteRef}
                onScroll={(e) => { if (finDuTexte(e.currentTarget)) setFini(true); }}
                className="selectable max-h-[55vh] overflow-y-auto whitespace-pre-line pr-1 text-[0.95rem] leading-relaxed"
              >
                {histoire.texte}
              </div>
            )}
            {histoire?.type === "video" && !fini && (
              <p className="mt-3 text-center text-xs text-foreground/50">Regarde jusqu'au bout pour continuer.</p>
            )}
            {histoire?.type === "texte" && !fini && (
              <p className="mt-2 text-center text-xs text-foreground/50">Lis jusqu'en bas pour continuer.</p>
            )}
          </div>

          <div className="border-t border-border p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              disabled={!fini}
              onClick={onTermine}
              className="w-full rounded-full brand-gradient px-6 py-3 text-base font-bold text-white transition disabled:opacity-40"
            >
              {libelleFin(histoire?.type)}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
