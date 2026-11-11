import React from "react";

// Image affichée ENTIÈRE, sans recadrage : largeur du conteneur, hauteur naturelle (plafonnée à 70 % de
// l'écran), object-contain. Pour les couvertures d'articles et les images des nouveautés.
export const FULL_IMAGE_CLASSES = "block w-full h-auto max-h-[70vh] object-contain";

export default function FullImage({ src, alt = "", className = "" }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${FULL_IMAGE_CLASSES} ${className}`.trim()}
    />
  );
}
