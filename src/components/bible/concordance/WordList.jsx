import React from "react";
import { Star } from "lucide-react";

// Liste de mots « mot (occurrences) » avec étoile favori, lignes alternées
// noir / gris foncé comme dans l'interface d'origine.
// `words` = [{ word, count }] ; `count` = nombre de versets contenant le mot.
export default function WordList({ words, favorites, onToggleFavorite, onPick, empty }) {
  if (words.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul>
      {words.map(({ word, count }, i) => {
        const fav = favorites.includes(word);
        return (
          <li
            key={word}
            className={`flex items-center ${i % 2 === 0 ? "bg-black" : "bg-zinc-900"}`}
          >
            <button
              onClick={() => onPick(word)}
              className="min-w-0 flex-1 truncate px-4 py-4 text-left text-base text-white/90"
            >
              {word} ({count})
            </button>
            <button
              onClick={() => onToggleFavorite(word)}
              aria-label={fav ? `Retirer « ${word} » des favoris` : `Ajouter « ${word} » aux favoris`}
              aria-pressed={fav}
              className="px-4 py-4"
            >
              <Star
                className={`h-6 w-6 ${fav ? "fill-slate-300 text-slate-300" : "text-slate-500"}`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}