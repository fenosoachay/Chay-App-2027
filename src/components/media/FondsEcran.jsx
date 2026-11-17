import React, { useEffect, useState } from "react";
import { Download, ImageDown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useBackHandler } from "@/hooks/useBackHandler";
import { enregistrerFond, trierFonds, vignetteFond } from "@/lib/fondsEcran";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerOrdreChamp } from "@/lib/ordreChamp";

// Multimédia › « Fond d'écran » : défilement horizontal (glisser gauche/droite), comme la Galerie.
// Bouton « Télécharger » en haut à droite de chaque image.
export default function FondsEcran() {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [scrollRef, setScrollRef] = useState(null);
  const { user } = useAuth();
  // Admin (1.3.9) : ordre au doigt, champ `order` (vu par les membres : trierFonds).
  const reordonner = async (next) => {
    setListe(next);
    try {
      setListe(await enregistrerOrdreChamp(next, (id, d) => base44.entities.Wallpaper.update(id, d)));
    } catch (e) {
      toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" });
      base44.entities.Wallpaper.list("-created_date", 500).then((rows) => setListe(trierFonds(rows))).catch(() => {});
    }
  };

  useEffect(() => {
    let actif = true;
    base44.entities.Wallpaper.list("-created_date", 500)
      .then((rows) => { if (actif) setListe(trierFonds(rows)); })
      .catch(() => { if (actif) setListe([]); });
    return () => { actif = false; };
  }, []);

  useBackHandler(ouvert !== null, () => setOuvert(null));

  const enregistrer = async (fond) => {
    setEnvoi(true);
    try {
      const ou = await enregistrerFond(fond);
      toast({ title: ou === "galerie" ? "Enregistré dans la galerie (Images › Chay)" : "Téléchargement lancé" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  const go = (delta) => {
    if (!scrollRef.current) return;
    const scrollAmount = 220; // largeur d'une vignette + gap
    scrollRef.current.scrollBy({ left: delta * scrollAmount, behavior: "smooth" });
  };

  if (liste === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!liste.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
        <ImageDown className="mx-auto mb-3 h-8 w-8 text-foreground/40" aria-hidden="true" />
        <p className="font-semibold">Aucun fond d'écran pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => go(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 -ml-3 md:hidden"
          aria-label="Fonds d'écran précédents"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div
          ref={setScrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-3 -mx-3 px-3 snap-x snap-mandatory"
          role="region"
          aria-label="Fonds d'écran"
        >
          {liste.map((f) => (
            <div
              key={f.id}
              className="relative flex-shrink-0 snap-center w-[160px] aspect-[9/16] md:w-[180px]"
            >
              <button
                type="button"
                onClick={() => setOuvert(f)}
                className="w-full h-full overflow-hidden rounded-2xl bg-muted shadow-sm"
                aria-label={`Fond d'écran ${f.title || ""}`.trim()}
              >
                <img src={vignetteFond(f)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); enregistrer(f); }}
                disabled={envoi}
                className="absolute top-2 right-2 z-10 h-8 w-8 grid place-items-center rounded-full bg-white/80 text-foreground hover:bg-white disabled:opacity-50 shadow-md"
                aria-label={`Télécharger ${f.title || "cet arrière-plan"}`}
              >
                {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-12 w-12 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 -mr-3 md:hidden"
          aria-label="Fonds d'écran suivants"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      <Dialog open={ouvert !== null} onOpenChange={(v) => !v && setOuvert(null)}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
          {ouvert && (
            <div>
              <DialogTitle className="mb-3 pr-8 font-display text-xl font-extrabold">{ouvert.title || "Fond d'écran"}</DialogTitle>
              <img src={vignetteFond(ouvert)} alt="" className="mx-auto max-h-[60vh] rounded-2xl object-contain" />
              <button
                type="button"
                disabled={envoi}
                onClick={() => enregistrer(ouvert)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
              >
                {envoi ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {envoi ? "Enregistrement…" : "Enregistrer dans la galerie"}
              </button>
              <p className="mt-2 text-center text-xs text-foreground/50">Image en pleine qualité.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}