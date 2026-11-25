import React, { useMemo, useState } from "react";
import { Check, Copy, Share2, Star } from "lucide-react";
import { getDefinitions } from "@/lib/dictionaryDb";

// Écran 3 : titre en en-tête puis contenu en paragraphes (16 px minimum).
// Un mot présent plusieurs fois dans la base affiche toutes ses définitions.
function toParagraphs(text) {
  return String(text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function DictionaryDefinition({ db, mot, favorite, onToggleFavorite }) {
  const [copied, setCopied] = useState(false);
  const defs = useMemo(
    () => getDefinitions(db, mot).map((d) => ({ title: d.titre || mot, paragraphs: toParagraphs(d.contenu) })),
    [db, mot]
  );

  if (!defs.length) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Définition introuvable.</p>;
  }

  const fullText = defs.map((d) => `${d.title}\n\n${d.paragraphs.join("\n\n")}`).join("\n\n———\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* presse-papiers refusé */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: defs[0].title, text: fullText });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    copy();
  };

  return (
    <article className="mx-3 mb-10 mt-2 rounded-[1.5rem] border border-[#C9A052]/30 bg-white/[0.04] px-4 pb-8 pt-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 font-display text-3xl font-extrabold leading-tight text-[#F3E2B5]">{defs[0].title}</h2>
        <div className="flex shrink-0 items-center">
          <button
            onClick={() => onToggleFavorite(mot)}
            aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={favorite}
            className="rounded-lg p-2 hover:bg-white/10"
          >
            <Star className="h-6 w-6" style={{ color: "#FFD66E", fill: favorite ? "#FFD66E" : "transparent" }} />
          </button>
          <button onClick={copy} aria-label="Copier le texte" className="rounded-lg p-2 text-[#F3E2B5]/70 hover:bg-white/10">
            {copied ? <Check className="h-6 w-6 text-green-400" /> : <Copy className="h-6 w-6" />}
          </button>
          <button onClick={share} aria-label="Partager" className="rounded-lg p-2 text-[#F3E2B5]/70 hover:bg-white/10">
            <Share2 className="h-6 w-6" />
          </button>
        </div>
      </div>
      {defs.map((d, di) => (
        <section key={di} className={di > 0 ? "mt-8 border-t border-[#C9A052]/25 pt-6" : ""}>
          {di > 0 && <h3 className="mb-3 font-display text-xl font-extrabold text-[#F3E2B5]">{d.title}</h3>}
          <div className="selectable space-y-4 leading-relaxed text-white/90" style={{ fontSize: "max(16px, 1rem)" }}>
            {d.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}
