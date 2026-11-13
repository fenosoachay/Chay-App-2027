import React, { useEffect, useState } from "react";
import { Download, ImageDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useBackHandler } from "@/hooks/useBackHandler";
import { enregistrerFond, trierFonds, vignetteFond } from "@/lib/fondsEcran";

// Multimédia › « Fond d'écran » : grille de vignettes (format téléphone) ; un toucher ouvre l'aperçu et le bouton
// « Enregistrer dans la galerie » (APK : dossier Images/Chay ; navigateur : téléchargement).
export default function FondsEcran() {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [envoi, setEnvoi] = useState(false);

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
      <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
        {liste.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setOuvert(f)}
            className="block aspect-[9/16] overflow-hidden rounded-2xl bg-muted shadow-sm"
            aria-label={`Fond d'écran ${f.title || ""}`.trim()}
          >
            <img src={vignetteFond(f)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
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
