import React, { useState } from "react";

// Description saisie par l'admin (vidéo, prédication, playlist…) : affichée seulement si elle est remplie.
// Longue : 3 lignes puis « Voir plus ». `clair` : texte blanc, pour un fond sombre (vidéo plein écran).
export default function Description({ texte, className = "", clair = false }) {
  const [ouvert, setOuvert] = useState(false);
  const t = String(texte || "").trim();
  if (!t) return null;
  const longue = t.length > 160 || t.split("\n").length > 3;
  return (
    <div className={className}>
      <p className={`whitespace-pre-line break-words text-sm ${clair ? "text-white/85" : "text-foreground/65"} ${!ouvert && longue ? "line-clamp-3" : ""}`}>
        {t}
      </p>
      {longue && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOuvert((o) => !o); }}
          className={`mt-1 text-xs font-bold ${clair ? "text-white" : "text-primary"}`}
        >
          {ouvert ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  );
}
