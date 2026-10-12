import React from "react";
import { highlightSegments } from "@/lib/bibleSearchHighlight";

// Liste de versets trouvés (recherche intégrée et concordance) : référence
// exacte, texte complet du verset, mot recherché mis en évidence.
// `entries` = [{ bookIdx, chapter, verse, text }] ; `books` = index.books.
export default function VerseResultList({ entries, books, query, lang, onSelect }) {
  return (
    <ul className="selectable space-y-1">
      {entries.map((r) => {
        const book = books[r.bookIdx];
        return (
          <li key={`${r.bookIdx}-${r.chapter}-${r.verse}`}>
            <button
              onClick={() => onSelect(r)}
              className="block w-full rounded-xl px-3 py-2 text-left text-xs transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="font-bold text-primary">
                {book?.name} {r.chapter}:{r.verse}
              </span>
              <span className="ml-2 text-foreground/80">
                {highlightSegments(r.text, query, lang).map((seg, i) =>
                  seg.match ? (
                    <mark key={i} className="rounded bg-primary/30 px-0.5 text-foreground">
                      {seg.text}
                    </mark>
                  ) : (
                    <React.Fragment key={i}>{seg.text}</React.Fragment>
                  )
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}