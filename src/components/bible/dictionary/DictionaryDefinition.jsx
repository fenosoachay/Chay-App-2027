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
    <article className="px-4 pb-10 pt-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-bold leading-tight text-white">{defs[0].title}</h2>
        <div className="flex shrink-0 items-center">
          <button
            onClick={() => onToggleFavorite(mot)}
            aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={favorite}
            className="rounded-lg p-2 hover:bg-white/10"
          >
            <Star className={`h-6 w-6 ${favorite ? "fill-slate-300 text-slate-300" : "text-slate-400"}`} />
          </button>
          <button onClick={copy} aria-label="Copier le texte" className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
            {copied ? <Check className="h-6 w-6 text-green-400" /> : <Copy className="h-6 w-6" />}
          </button>
          <button onClick={share} aria-label="Partager" className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
            <Share2 className="h-6 w-6" />
          </button>
        </div>
      </div>
      {defs.map((d, di) => (
        <section key={di} className={di > 0 ? "mt-8 border-t border-zinc-800 pt-6" : ""}>
          {di > 0 && <h3 className="mb-3 text-xl font-bold text-white">{d.title}</h3>}
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