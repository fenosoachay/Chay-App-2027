import React from "react";
import { Star } from "lucide-react";

// Écran 2 (et favoris) : mot + étoile, lignes alternées comme la concordance.
// `words` = [{ mot, titre }].
export default function DictionaryWordList({ words, favorites, onToggleFavorite, onPick, empty }) {
  if (words.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul>
      {words.map(({ mot }, i) => {
        const fav = favorites.includes(mot);
        return (
          <li key={mot} className={`flex items-center ${i % 2 === 0 ? "bg-black" : "bg-zinc-900"}`}>
            <button
              onClick={() => onPick(mot)}
              className="min-w-0 flex-1 truncate px-4 py-4 text-left text-base text-white/90"
            >
              {mot}
            </button>
            <button
              onClick={() => onToggleFavorite(mot)}
              aria-label={fav ? `Retirer « ${mot} » des favoris` : `Ajouter « ${mot} » aux favoris`}
              aria-pressed={fav}
              className="px-4 py-4"
            >
              <Star className={`h-6 w-6 ${fav ? "fill-slate-300 text-slate-300" : "text-slate-500"}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}