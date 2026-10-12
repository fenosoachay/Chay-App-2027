import React, { useMemo } from "react";
import { Search, X } from "lucide-react";
import { searchWords } from "@/lib/dictionaryDb";

// Barre de recherche + liste de suggestions en temps réel (20 max).
// Cliquer sur une suggestion ouvre directement la définition.
export default function DictionarySearchBox({ db, query, onChange, onPick }) {
  const suggestions = useMemo(() => (db ? searchWords(db, query, 20) : []), [db, query]);
  const open = query.trim().length > 0;

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un mot…"
        aria-label="Mot à rechercher dans le dictionnaire"
        maxLength={100}
        className="w-full border-b border-slate-500 bg-transparent py-1.5 pl-9 pr-8 text-base text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
      />
      {query && (
        <button
          onClick={() => onChange("")}
          aria-label="Effacer"
          className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {open && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          {suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-400">Aucun mot trouvé.</li>
          ) : (
            suggestions.map(({ mot }) => (
              <li key={mot}>
                <button
                  onClick={() => onPick(mot)}
                  className="w-full truncate px-4 py-3 text-left text-base text-white/90 hover:bg-white/10"
                >
                  {mot}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}