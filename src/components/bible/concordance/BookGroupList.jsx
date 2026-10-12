import React from "react";
import { ChevronRight } from "lucide-react";

// Étape 1 : résultats d'un mot groupés par livre, dans l'ordre canonique.
export default function BookGroupList({ word, groups, onPick }) {
  const { total, books } = groups;
  return (
    <div>
      <p className="px-4 py-3 text-sm font-bold text-white">
        {total === 0
          ? `${word} — aucune occurrence`
          : `${word} — ${total} occurrence${total > 1 ? "s" : ""} dans ${books.length} livre${books.length > 1 ? "s" : ""}`}
      </p>
      <ul>
        {books.map((b, i) => (
          <li key={b.bookIdx} className={i % 2 === 0 ? "bg-black" : "bg-zinc-900"}>
            <button
              onClick={() => onPick(b)}
              className="flex w-full items-center justify-between px-4 py-4 text-left text-base text-white/90"
            >
              <span>
                {b.name} ({b.count})
              </span>
              <ChevronRight className="h-5 w-5 text-slate-500" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}