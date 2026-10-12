import React from "react";
import { ALPHABET } from "@/lib/concordanceBrowse";

// Écran 1 : les 26 lettres. Une lettre absente de la base est grisée.
export default function DictionaryLetterGrid({ available, onPick }) {
  return (
    <div className="grid grid-cols-5 gap-2 p-4 sm:grid-cols-6">
      {ALPHABET.map((letter) => (
        <button
          key={letter}
          onClick={() => onPick(letter)}
          disabled={!available.includes(letter)}
          aria-label={`Mots commençant par ${letter}`}
          className="flex aspect-square items-center justify-center rounded-xl bg-muted text-xl font-bold text-foreground transition hover:bg-primary/20 disabled:opacity-30"
        >
          {letter}
        </button>
      ))}
    </div>
  );
}