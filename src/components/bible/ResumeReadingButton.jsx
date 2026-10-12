import React from "react";
import { Bookmark } from "lucide-react";

// Bouton « Reprendre à Jean 3 » affiché en haut du lecteur quand une
// progression existe pour la version choisie.
export default function ResumeReadingButton({ bookName, chapter, verse, onResume }) {
  return (
    <button
      onClick={onResume}
      className="flex w-full items-center gap-3 border-b border-border bg-primary/10 px-4 py-3 text-left transition hover:bg-primary/15 md:px-6"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl brand-gradient text-white shadow-sm">
        <Bookmark className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">
          Reprendre à {bookName} {chapter}
        </span>
        {verse > 1 && <span className="block text-[11px] text-muted-foreground">Verset {verse}</span>}
      </span>
    </button>
  );
}