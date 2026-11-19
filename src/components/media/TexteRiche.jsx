import React from "react";
import DOMPurify from "dompurify";
import "react-quill-new/dist/quill.snow.css";

// Texte saisi avec l'éditeur de l'admin (Quill) : affiché avec les styles de l'éditeur, donc exactement comme
// il a été tapé (lignes vides, centrage, tailles, couleurs, listes). Texte simple : retours à la ligne gardés.
const ressembleHtml = (s) => /<[a-z][^>]*>/i.test(s || "");

export default function TexteRiche({ html, className = "" }) {
  if (!html) return null;
  if (!ressembleHtml(html)) {
    return <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>{html}</div>;
  }
  return (
    <div className={`ql-snow ${className}`}>
      <div
        className="ql-editor texte-riche"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    </div>
  );
}
