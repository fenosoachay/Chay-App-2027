import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cleVue, histoireAMontrer, noterVueLocale } from "@/lib/petiteHistoire";

// Petite histoire (1.3.25) : s'ouvre à l'ouverture de l'app quand les admins en ont publié une que le membre n'a
// pas encore vue. On ne peut la fermer qu'avec « Ok » (pas en touchant à côté) ; ensuite elle ne revient plus.
export default function PetiteHistoirePopup({ user }) {
  const [histoire, setHistoire] = useState(null);
  const [videoIllisible, setVideoIllisible] = useState(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    let vivant = true;
    // Petit délai : l'animation d'ouverture de l'app passe d'abord.
    const t = setTimeout(() => {
      base44.entities.PetiteHistoire.filter({ actif: true }, "-created", 5)
        .then((rows) => { if (vivant) setHistoire(histoireAMontrer(rows, user)); })
        .catch(() => {});
    }, 2500);
    return () => { vivant = false; clearTimeout(t); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!histoire) return null;

  const ok = () => {
    const id = histoire.id;
    setHistoire(null);
    noterVueLocale(id);
    base44.functions.invoke("histoireVue", { devotional_id: cleVue(id) }).catch(() => {});
  };
  const description = String(histoire.description || "").trim();

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-[1.5rem] p-0 [&>button:last-child]:hidden"
      >
        <div className="flex max-h-[90vh] flex-col">
          <div className="brand-gradient px-5 pb-4 pt-5 text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <Sparkles className="h-3.5 w-3.5" /> Petite histoire
            </div>
            <DialogTitle className="mt-2 font-display text-xl font-extrabold text-white">
              {String(histoire.titre || "").trim() || "Une petite histoire pour toi"}
            </DialogTitle>
            <DialogDescription className="sr-only">Petite histoire publiée par l'Église Chay</DialogDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {histoire.type === "video" && (
              videoIllisible ? (
                <p className="rounded-xl bg-muted p-4 text-center text-sm">Cette vidéo ne peut pas être lue sur cet appareil.</p>
              ) : (
                <video
                  src={histoire.media_url}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  onError={() => setVideoIllisible(true)}
                  className="max-h-[55vh] w-full rounded-xl bg-black"
                />
              )
            )}
            {histoire.type === "photo" && (
              <img src={histoire.media_url} alt={histoire.titre || "Petite histoire"} className="max-h-[55vh] w-full rounded-xl object-contain" />
            )}
            {histoire.type !== "texte" && description && (
              <p className="selectable mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed">{description}</p>
            )}
            {histoire.type === "texte" && (
              <div className="selectable whitespace-pre-line text-[0.95rem] leading-relaxed">{histoire.texte}</div>
            )}
          </div>

          <div className="border-t border-border p-4" style={{ paddingBottom: "max(1rem, var(--sa-bottom))" }}>
            <button type="button" onClick={ok} className="w-full rounded-full brand-gradient px-6 py-3 text-base font-bold text-white">
              Ok
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
