import React, { useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import PaginatedVerseSearch from "@/components/bible/PaginatedVerseSearch";
import { LANGUAGES } from "@/lib/bibleConstants";

// Bloc 3 — Concordance : tous les mots de la Bible choisie (FR ou MG), y
// compris les mots très courts, via l'index inversé local (hors ligne).
export default function BibleConcordance({ onBack, onOpenVerse }) {
  const [lang, setLang] = useState("fr");
  const [query, setQuery] = useState("");

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-8">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10"
        >
          <ChevronLeft className="h-5 w-5" /> Retour
        </button>
      </div>

      <header className="mb-4 flex items-center gap-2.5">
        <div className="rounded-xl bg-primary/10 p-2">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">Concordance</h1>
          <p className="text-xs text-muted-foreground">
            Tous les mots de la Bible, même les plus courts
          </p>
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-border">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              aria-pressed={lang === l.id}
              className={`px-3.5 py-2 text-xs font-bold transition ${
                lang === l.id ? "brand-gradient text-white" : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "fr" ? "Un mot : a, ou, grâce, Jésus…" : "Teny iray : ny, sy, Jesosy…"}
            aria-label="Mot à rechercher dans la concordance"
            maxLength={100}
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {query.trim() ? (
        <PaginatedVerseSearch
          query={query}
          lang={lang}
          onSelect={(ref) => onOpenVerse(lang, ref)}
        />
      ) : (
        <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          Saisissez un mot (ou plusieurs) pour voir tous les versets qui le contiennent.
        </p>
      )}
    </main>
  );
}