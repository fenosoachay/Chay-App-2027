import React from "react";
import { highlightSegments } from "@/lib/bibleSearchHighlight";
import VerseCopyButton from "@/components/bible/concordance/VerseCopyButton";
import { LigneNuit, ListeNuit } from "@/components/bible/NuitDoree";

// Étape 2 : versets d'un livre contenant le mot (déjà triés chapitre/verset).
// Cliquer sur la référence ouvre le verset dans le lecteur.
export default function BookVerseList({ verses, bookName, word, lang, onOpen }) {
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-sm font-bold text-[#F3E2B5]">
        {bookName} — {verses.length} verset{verses.length > 1 ? "s" : ""} contenant « {word} »
      </p>
      <ListeNuit>
        {verses.map((v, i) => {
          const ref = `${bookName} ${v.chapter}:${v.verse}`;
          return (
            <LigneNuit key={`${v.chapter}-${v.verse}`} i={i} className="selectable items-start gap-1 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm leading-relaxed text-white/85">
                <button onClick={() => onOpen(v)} className="mr-2 font-bold text-[#FFD66E] hover:underline">
                  {ref}
                </button>
                {highlightSegments(v.text, word, lang).map((seg, j) =>
                  seg.match ? (
                    <mark key={j} className="rounded bg-amber-400/80 px-0.5 font-semibold text-black">
                      {seg.text}
                    </mark>
                  ) : (
                    <React.Fragment key={j}>{seg.text}</React.Fragment>
                  )
                )}
              </div>
              <VerseCopyButton reference={ref} text={v.text} />
            </LigneNuit>
          );
        })}
      </ListeNuit>
    </div>
  );
}
