import React from "react";
import DOMPurify from "dompurify";
import "react-quill-new/dist/quill.snow.css";

// Texte saisi avec l'éditeur de l'admin (Quill) : affiché avec les styles de l'éditeur, donc exactement comme
// il a été tapé (lignes vides, centrage, tailles, couleurs, listes). Texte simple : retours à la ligne gardés.
const ressembleHtml = (s) => /<[a-z][^>]*>/i.test(s || "");

// L'éditeur enregistre une ligne vide comme un paragraphe vide (« <p></p> »), qui ne prend aucune hauteur à
// l'affichage : on lui redonne une ligne (« <p><br></p> », comme dans l'éditeur).
export const lignesVides = (html) =>
  String(html || "").replace(/<(p|h[1-6]|li)([^>]*)>(?:\s|&nbsp;|\u00a0)*<\/\1>/gi, "<$1$2><br></$1>");

export default function TexteRiche({ html, className = "" }) {
  if (!html) return null;
  if (!ressembleHtml(html)) {
    return <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>{html}</div>;
  }
  return (
    <div className={`ql-snow ${className}`}>
      <div
        className="ql-editor texte-riche"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(lignesVides(html)) }}
      />
    </div>
  );
}
