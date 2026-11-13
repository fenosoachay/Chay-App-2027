import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { ExternalLink, Loader2, Newspaper } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBackHandler } from "@/hooks/useBackHandler";
import { trierActualites, lienSur } from "@/lib/actualites";

// Multimédia › « Actualité chrétienne » : publications de l'admin (collection ChristianNews). Section visible
// des membres même vide ; une publication s'ouvre en lecture (texte riche nettoyé, lien externe éventuel).
export default function ActualiteChretienne({ cibleId = null, onFermerCible }) {
  const [liste, setListe] = useState(null);
  const [ouverte, setOuverte] = useState(null);

  useEffect(() => {
    let actif = true;
    base44.entities.ChristianNews.list("-created_date", 200)
      .then((rows) => { if (actif) setListe(trierActualites(rows)); })
      .catch(() => { if (actif) setListe([]); });
    return () => { actif = false; };
  }, []);

  // Lien direct (?news=<id>) : publication ouverte dès qu'elle est chargée.
  useEffect(() => {
    if (!cibleId || !liste) return;
    const n = liste.find((x) => x.id === cibleId);
    if (n) setOuverte(n);
  }, [cibleId, liste]);

  const fermer = () => { setOuverte(null); onFermerCible?.(); };
  useBackHandler(ouverte !== null, fermer);

  if (liste === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <>
      {liste.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
          <Newspaper className="mx-auto mb-3 h-8 w-8 text-foreground/40" aria-hidden="true" />
          <p className="font-semibold">Aucune actualité pour le moment.</p>
          <p className="mt-1 text-sm text-foreground/60">Les nouvelles du monde chrétien apparaîtront ici.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {liste.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setOuverte(n)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:bg-muted"
              >
                {n.cover_url ? (
                  <img src={n.cover_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover bg-muted" />
                ) : (
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl brand-gradient text-white" aria-hidden="true">
                    <Newspaper className="h-6 w-6" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold break-words">{n.title}</span>
                  {n.summary && <span className="mt-0.5 block text-sm text-foreground/60 line-clamp-2">{n.summary}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={ouverte !== null} onOpenChange={(v) => !v && fermer()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {ouverte && (
            <article>
              {ouverte.cover_url && <img src={ouverte.cover_url} alt="" className="mb-4 max-h-64 w-full rounded-xl object-cover" />}
              <DialogTitle className="mb-3 font-display text-2xl font-extrabold">{ouverte.title}</DialogTitle>
              {ouverte.summary && <p className="mb-4 font-semibold text-foreground/70">{ouverte.summary}</p>}
              <div
                className="prose prose-sm md:prose-base dark:prose-invert max-w-none break-words"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ouverte.body || "") }}
              />
              {lienSur(ouverte.link_url) && (
                <a
                  href={lienSur(ouverte.link_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
                >
                  Lire la source <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </article>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
