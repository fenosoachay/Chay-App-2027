import React from "react";
import { ChevronRight, Star } from "lucide-react";
import { LigneNuit, ListeNuit, OR, VideNuit } from "@/components/bible/NuitDoree";

// Écran 2 (et favoris) : mot + étoile. `words` = [{ mot, titre }]. (1.3.34 : style Chay Game.)
export default function DictionaryWordList({ words, favorites, onToggleFavorite, onPick, empty }) {
  if (words.length === 0) return <VideNuit>{empty}</VideNuit>;
  return (
    <ListeNuit>
      {words.map(({ mot }, i) => {
        const fav = favorites.includes(mot);
        return (
          <LigneNuit key={mot} i={i}>
            <button type="button" onClick={() => onPick(mot)} className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3.5 text-left text-base text-white/90 hover:text-white">
              <span className="min-w-0 flex-1 truncate">{mot}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavorite(mot)}
              aria-label={fav ? `Retirer « ${mot} » des favoris` : `Ajouter « ${mot} » aux favoris`}
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
