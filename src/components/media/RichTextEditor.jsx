import React from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link"],
    [{ size: ["small", false, "large", "huge"] }],
    [{ color: [] }],
    ["clean"],
  ],
};

// Quill produit du HTML propre (<strong>, <em>, <u>, <h1-3>, <ul>/<ol>,
// <a>, styles d'alignement et de taille) — consommé tel quel par
// ArticleCard.jsx (sanitize DOMPurify). Le champ « body » reste un string.
export default function RichTextEditor({ value, onChange, placeholder }) {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <ReactQuill
        theme="snow"
        value={value || ""}
        onChange={onChange}
        modules={MODULES}
        placeholder={placeholder || "Rédigez votre article…"}
        className="chay-quill"
      />
    </div>
  );
}