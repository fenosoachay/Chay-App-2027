import React from "react";
import { ALPHABET } from "@/lib/concordanceBrowse";

// Écran d'accueil : les 26 lettres sous forme de grille cliquable.
export default function AlphabetGrid({ counts, onPick }) {
  return (
    <div className="grid grid-cols-5 gap-2 p-4 sm:grid-cols-6">
      {ALPHABET.map((letter) => {
        const empty = !counts[letter];
        return (
          <button
            key={letter}
            onClick={() => onPick(letter)}
            disabled={empty}
            aria-label={`Mots commençant par ${letter}`}
            className="flex aspect-square items-center justify-center rounded-xl bg-muted text-xl font-bold text-foreground transition hover:bg-primary/20 disabled:opacity-30"
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}