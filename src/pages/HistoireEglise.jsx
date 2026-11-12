import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { ChevronLeft, ChevronRight, Landmark, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBackHandler } from "@/hooks/useBackHandler";
import { photosHistoire } from "@/lib/menuEglise";

// Menu ☰ > « Histoire de l'église » : texte et photos rédigés par l'admin (collection ChurchHistory,
// fiche la plus récente). Texte riche nettoyé (DOMPurify), comme les articles.
export default function HistoireEglise() {
  const [fiche, setFiche] = useState(undefined);
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    base44.entities.ChurchHistory.list("-updated_date", 1)
      .then((rows) => setFiche((Array.isArray(rows) && rows[0]) || null))
      .catch(() => setFiche(null));
  }, []);

  const photos = photosHistoire(fiche);
  useBackHandler(photo !== null, () => setPhoto(null));

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-3">
        <span className="h-11 w-11 shrink-0 rounded-2xl brand-gradient grid place-items-center text-white">
          <Landmark className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="font-display font-extrabold text-3xl">
          <span className="brand-gradient-text">{fiche?.title || "Histoire de l'église"}</span>
        </h1>
      </header>

      {fiche === undefined ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : !fiche ? (
        <p className="text-foreground/60">L'histoire de l'église sera bientôt publiée.</p>
      ) : (
        <>
          <article
            className="prose prose-sm md:prose-base dark:prose-invert max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fiche.body || "") }}
          />
          {photos.length > 0 && (
            <section className="mt-8" aria-label="Photos">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setPhoto(i)}
                    className="block aspect-square overflow-hidden rounded-xl bg-muted"
                    aria-label={`Agrandir la photo ${i + 1}`}
                  >
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              <Dialog open={photo !== null} onOpenChange={(v) => !v && setPhoto(null)}>
                <DialogContent className="max-w-3xl p-2">
                  <DialogTitle className="sr-only">Photo {photo !== null ? photo + 1 : ""} sur {photos.length}</DialogTitle>
                  {photo !== null && (
                    <img src={photos[photo]} alt="" className="max-h-[75vh] w-full rounded-lg object-contain" />
                  )}
                  {photos.length > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setPhoto((i) => (i - 1 + photos.length) % photos.length)} className="h-11 w-11 grid place-items-center rounded-full border border-border" aria-label="Photo précédente">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <span className="text-sm text-foreground/60">{photo + 1} / {photos.length}</span>
                      <button type="button" onClick={() => setPhoto((i) => (i + 1) % photos.length)} className="h-11 w-11 grid place-items-center rounded-full border border-border" aria-label="Photo suivante">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </section>
          )}
        </>
      )}
    </div>
  );
}
