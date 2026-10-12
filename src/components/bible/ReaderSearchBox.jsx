import React, { useState } from "react";
import { Search, X } from "lucide-react";
import PaginatedVerseSearch from "@/components/bible/PaginatedVerseSearch";

// Recherche intégrée en haut du lecteur : mots du texte de la langue
// sélectionnée, via l'index local (aucune API). Un clic sur un résultat ouvre
// le verset dans le lecteur.
export default function ReaderSearchBox({ lang, onSelect }) {
  const [query, setQuery] = useState("");

  return (
    <div className="border-b border-border px-3 py-3 md:px-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "fr" ? "Rechercher un mot ou une expression…" : "Hikatsaka teny na andian-teny…"}
          aria-label="Rechercher dans la Bible"
          maxLength={100}
          className="w-full rounded-2xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {query.trim() && (
        <div className="mt-3">
          <PaginatedVerseSearch
            query={query}
            lang={lang}
            maxHeightClass="max-h-[55vh]"
            onSelect={(ref) => {
              setQuery("");
              onSelect(ref);
            }}
          />
        </div>
      )}
    </div>
  );
}