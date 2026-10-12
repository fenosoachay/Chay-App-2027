import React from "react";
import { highlightSegments } from "@/lib/bibleSearchHighlight";
import VerseCopyButton from "@/components/bible/concordance/VerseCopyButton";

// Étape 2 : versets d'un livre contenant le mot (déjà triés chapitre/verset).
// Cliquer sur la référence ouvre le verset dans le lecteur.
export default function BookVerseList({ verses, bookName, word, lang, onOpen }) {
  return (
    <div>
      <p className="px-4 py-3 text-sm font-bold text-white">
        {bookName} — {verses.length} verset{verses.length > 1 ? "s" : ""} contenant « {word} »
      </p>
      <ul className="selectable">
        {verses.map((v, i) => {
          const ref = `${bookName} ${v.chapter}:${v.verse}`;
          return (
            <li
              key={`${v.chapter}-${v.verse}`}
              className={`flex items-start gap-1 px-4 py-3 ${i % 2 === 0 ? "bg-black" : "bg-zinc-900"}`}
            >
              <div className="min-w-0 flex-1 text-sm leading-relaxed text-white/85">
                <button onClick={() => onOpen(v)} className="mr-2 font-bold text-sky-300 hover:underline">
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}