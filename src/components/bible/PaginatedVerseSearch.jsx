import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import useConcordanceIndex from "@/hooks/useConcordanceIndex";
import { lookupPhrase } from "@/lib/bibleConcordance";
import VerseResultList from "@/components/bible/VerseResultList";

const PAGE_SIZE = 50;

// Résultats paginés d'une recherche dans l'index local de la langue `lang`.
// Le calcul est fait sur l'index inversé (aucun parcours du texte entier) ;
// "Afficher plus" donne accès à TOUS les résultats, par pages de 50.
// `onSelect({ bookId, chapter, verse })` ouvre le verset dans le lecteur.
export default function PaginatedVerseSearch({ query, lang, onSelect, maxHeightClass = "" }) {
  const { index, status, error, retry } = useConcordanceIndex(lang);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [result, setResult] = useState({ total: 0, entries: [] });

  const trimmed = query.trim();

  // Nouvelle requête ou nouvelle langue : on repart de la première page.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [trimmed, lang]);

  useEffect(() => {
    if (!index || !trimmed) {
      setResult({ total: 0, entries: [] });
      return;
    }
    // lookupPhrase(…, {limit}) plafonne à 200 : on pagine donc par blocs.
    const run = () => {
      const entries = [];
      let total = 0;
      for (let offset = 0; offset < visible; offset += 200) {
        const r = lookupPhrase(index, trimmed, {
          offset,
          limit: Math.min(200, visible - offset),
        });
        total = r.total;
        entries.push(...r.entries);
        if (entries.length >= total) break;
      }
      setResult({ total, entries });
    };
    run();
  }, [index, trimmed, lang, visible]);

  if (!trimmed) return null;

  if (status === "loading") {
    return (
      <p className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Préparation de l'index…
      </p>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 px-1 py-3">
        <p className="text-xs text-destructive">{error}</p>
        <button
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <section aria-live="polite" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-2.5">
        <h2 className="text-xs font-bold text-foreground">
          {result.total === 0
            ? `Aucun verset trouvé pour « ${trimmed} »`
            : `${result.total} verset(s) trouvé(s) pour « ${trimmed} »`}
        </h2>
      </div>
      {result.total > 0 && (
        <div className={`${maxHeightClass} overflow-y-auto px-3 py-2`}>
          <VerseResultList
            entries={result.entries}
            books={index.books}
            query={trimmed}
            lang={lang}
            onSelect={(r) =>
              onSelect({ bookId: index.books[r.bookIdx]?.id, chapter: r.chapter, verse: r.verse })
            }
          />
          {result.entries.length < result.total && (
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mt-2 w-full rounded-xl border border-border py-2 text-xs font-bold text-primary hover:bg-muted"
            >
              Afficher plus ({result.entries.length} / {result.total})
            </button>
          )}
        </div>
      )}
    </section>
  );
}