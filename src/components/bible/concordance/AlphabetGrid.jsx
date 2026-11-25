import React from "react";
import { ALPHABET } from "@/lib/concordanceBrowse";
import { GrilleLettres } from "@/components/bible/NuitDoree";

// Écran d'accueil : les 26 lettres sous forme de grille cliquable. (1.3.34 : style Chay Game.)
export default function AlphabetGrid({ counts, onPick }) {
  return (
    <GrilleLettres
      lettres={ALPHABET}
      desactivee={(l) => !counts[l]}
      onPick={onPick}
      libelle={(l) => `Mots commençant par ${l}`}
    />
  );
}
