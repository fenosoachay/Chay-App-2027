import React from "react";
import { BookMarked, ChevronLeft, Hammer } from "lucide-react";

// Bloc 2 — Dictionnaire. Les données ne sont pas encore disponibles : seul
// l'état « en construction » est affiché (aucune entrée ni recherche factice).
// La logique de recherche prête à brancher est dans src/lib/bibleDictionary.js.
export default function BibleDictionary({ onBack }) {
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

      <header className="mb-5 flex items-center gap-2.5">
        <div className="rounded-xl bg-primary/10 p-2">
          <BookMarked className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground md:text-2xl">Dictionnaire</h1>
      </header>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
        <div className="rounded-2xl bg-primary/10 p-3">
          <Hammer className="h-7 w-7 text-primary" />
        </div>
        <p className="text-base font-bold text-foreground">Dictionnaire en cours de construction</p>
      </div>
    </main>
  );
}