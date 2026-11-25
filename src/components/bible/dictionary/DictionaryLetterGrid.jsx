import React from "react";
import { ALPHABET } from "@/lib/concordanceBrowse";
import { GrilleLettres } from "@/components/bible/NuitDoree";

// Écran 1 : les 26 lettres. Une lettre absente de la base est grisée. (1.3.34 : style Chay Game.)
export default function DictionaryLetterGrid({ available, onPick }) {
  return (
    <GrilleLettres
      lettres={ALPHABET}
      desactivee={(l) => !available.includes(l)}
      onPick={onPick}
      libelle={(l) => `Mots commençant par ${l}`}
    />
  );
}
