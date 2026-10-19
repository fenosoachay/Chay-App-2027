import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Search, X, ArrowRight } from "lucide-react";
import useDictionaryFavorites from "@/hooks/useDictionaryFavorites";

export default function DictionaryTab() {
  const { favorites, toggle } = useDictionaryFavorites();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      [...favorites].sort((a, b) =>
        a.localeCompare(b, "fr", { sensitivity: "base" })
      ),
    [favorites]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((m) => m.toLowerCase().includes(q));
  }, [sorted, query]);

  const open = (mot) =>
    navigate(`/bible?view=dictionary&mot=${encodeURIComponent(mot)}`, {
      state: { chayBibleView: true },
    });

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-muted-foreground">
        {favorites.length} favori{favorites.length > 1 ? "s" : ""}
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
              : "Touchez l'étoile à côté d'un mot du dictionnaire pour l'ajouter ici."
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((mot) => (
            <li
              key={mot}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <BookMarked className="h-4 w-4 shrink-0 text-primary" />
              <button
                onClick={() => open(mot)}
                className="min-w-0 flex-1 text-left text-sm font-semibold text-foreground hover:text-primary"
              >
                {mot}
              </button>
              <button
                onClick={() => open(mot)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Ouvrir la définition"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggle(mot)}
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
      <BookMarked className="h-10 w-10 text-muted-foreground/40" />
      <div>
        <p className="font-bold text-foreground/70">{text}</p>
        {hint && (
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}