import React from "react";
import { ChevronRight } from "lucide-react";
import { LigneNuit, ListeNuit } from "@/components/bible/NuitDoree";

// Étape 1 : résultats d'un mot groupés par livre, dans l'ordre canonique. (1.3.34 : style Chay Game.)
export default function BookGroupList({ word, groups, onPick }) {
  const { total, books } = groups;
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-sm font-bold text-[#F3E2B5]">
        {total === 0
          ? `${word} — aucune occurrence`
          : `${word} — ${total} occurrence${total > 1 ? "s" : ""} dans ${books.length} livre${books.length > 1 ? "s" : ""}`}
      </p>
      <ListeNuit>
        {books.map((b, i) => (
          <LigneNuit key={b.bookIdx} i={i}>
            <button type="button" onClick={() => onPick(b)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-base text-white/90">
              <span className="min-w-0 flex-1 break-words">{b.name}</span>
              <span className="shrink-0 rounded-full border border-[#C9A052]/40 px-2 py-0.5 text-xs font-bold tabular-nums text-[#F3E2B5]">{b.count}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-white/35" />
            </button>
          </LigneNuit>
        ))}
      </ListeNuit>
    </div>
  );
}
