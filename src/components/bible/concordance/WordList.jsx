import React from "react";
import { Star } from "lucide-react";
import { LigneNuit, ListeNuit, OR, VideNuit } from "@/components/bible/NuitDoree";

// Liste de mots « mot (occurrences) » avec étoile favori (1.3.34 : style Chay Game).
// `words` = [{ word, count }] ; `count` = nombre de versets contenant le mot.
export default function WordList({ words, favorites, onToggleFavorite, onPick, empty }) {
  if (words.length === 0) return <VideNuit>{empty}</VideNuit>;
  return (
    <ListeNuit>
      {words.map(({ word, count }, i) => {
        const fav = favorites.includes(word);
        return (
          <LigneNuit key={word} i={i}>
            <button type="button" onClick={() => onPick(word)} className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3.5 text-left text-base text-white/90 hover:text-white">
              <span className="min-w-0 flex-1 truncate">{word}</span>
              <span className="shrink-0 rounded-full border border-[#C9A052]/40 px-2 py-0.5 text-xs font-bold tabular-nums text-[#F3E2B5]">{count}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleFavorite(word)}
              aria-label={fav ? `Retirer « ${word} » des favoris` : `Ajouter « ${word} » aux favoris`}
              aria-pressed={fav}
              className="px-4 py-3.5"
            >
              <Star className="h-5 w-5" style={{ color: fav ? OR : "rgba(255,255,255,0.35)", fill: fav ? OR : "transparent" }} />
            </button>
          </LigneNuit>
        );
      })}
    </ListeNuit>
  );
}
