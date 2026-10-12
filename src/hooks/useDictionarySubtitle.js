import { useEffect, useState } from "react";
import { openDictionary } from "@/lib/dictionaryDb";

export const DICTIONARY_READY_SUBTITLE = "Dictionnaire Biblique Alexandre Westphal";
export const DICTIONARY_FALLBACK_SUBTITLE = "En cours de construction";

// Sous-titre de la carte « Dictionnaire » du menu Bible.
// Affiche le nom du dictionnaire quand la base s'ouvre correctement ; au
// moindre problème côté utilisateur (téléchargement impossible, stockage
// refusé, base illisible), on garde « En cours de construction ».
export default function useDictionarySubtitle() {
  const [subtitle, setSubtitle] = useState(DICTIONARY_FALLBACK_SUBTITLE);

  useEffect(() => {
    let alive = true;
    openDictionary()
      .then(() => alive && setSubtitle(DICTIONARY_READY_SUBTITLE))
      .catch(() => alive && setSubtitle(DICTIONARY_FALLBACK_SUBTITLE));
    return () => {
      alive = false;
    };
  }, []);

  return subtitle;
}