import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import useConcordanceFavorites from "@/hooks/useConcordanceFavorites";

export default function ConcordanceTab() {
  const fr = useConcordanceFavorites("fr");
  const mg = useConcordanceFavorites("mg");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    return [
      ...fr.favorites.map((w) => ({ word: w, lang: "fr" })),
      ...mg.favorites.map((w) => ({ word: w, lang: "mg" })),
    ];
  }, [fr.favorites, mg.favorites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.word.toLowerCase().includes(q));
  }, [items, query]);

  const open = (word, lang) =>
    navigate(
      `/bible?view=concordance&word=${encodeURIComponent(word)}&lang=${lang}`,
      { state: { chayBibleView: true } }
    );

  const remove = (word, lang) => {
    if (lang === "fr") fr.toggle(word);
    else mg.toggle(word);
  };

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        {items.length} favori{items.length > 1 ? "s" : ""}
      </p>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un mot…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          text={query ? "Aucun résultat." : "Aucun favori pour le moment."}
          hint={
            query
              ? ""
              : "Touchez l'étoile à côté d'un mot de la concordance pour l'ajouter ici."
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((i) => (
            <li
              key={`${i.lang}-${i.word}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                {i.lang}
              </span>
              <button
                onClick={() => open(i.word, i.lang)}
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground hover:text-primary"
              >
                {i.word}
              </button>
              <button
                onClick={() => open(i.word, i.lang)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Ouvrir dans la concordance"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(i.word, i.lang)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ text, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Search className="h-10 w-10 text-muted-foreground/40" />
      <div>
        <p className="font-bold text-foreground/70">{text}</p>
        {hint && (
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}