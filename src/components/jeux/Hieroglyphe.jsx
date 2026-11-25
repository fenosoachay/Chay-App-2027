import React from "react";

// 26 hiéroglyphes dessinés (1.3.32, énigme « Allons en Égypte ») : traits simples, inspirés de l'écriture
// égyptienne (ankh, œil, eau, roseau, oiseau…). Dessins de l'app, sans police à télécharger.
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const DESSINS = [
  `<ellipse cx="12" cy="6" rx="4" ry="4" ${S}/><path d="M12 10v12M6 13h12" ${S}/>`, // ankh
  `<path d="M3 12c4-6 14-6 18 0c-4 6-14 6-18 0z" ${S}/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>`, // œil
  `<path d="M2 8l3-3 3 3 3-3 3 3 3-3 3 3M2 15l3-3 3 3 3-3 3 3 3-3 3 3" ${S}/>`, // eau
  `<path d="M12 22V4M12 4c3 1 5 4 5 7M12 9c-3 1-4 3-4 5" ${S}/>`, // roseau
  `<path d="M4 15c2-6 8-9 13-7l3-2-1 4c1 3-1 7-6 8H6z" ${S}/><circle cx="16" cy="9" r="1" fill="currentColor"/>`, // oiseau
  `<path d="M6 20V8a6 6 0 0 1 12 0v12" ${S}/><path d="M4 20h16" ${S}/>`, // porte
  `<path d="M12 3l9 17H3z" ${S}/><path d="M12 10v6" ${S}/>`, // pyramide
  `<circle cx="12" cy="12" r="8" ${S}/><circle cx="12" cy="12" r="2" fill="currentColor"/>`, // soleil
  `<path d="M5 20c0-8 3-14 7-16 4 2 7 8 7 16z" ${S}/><path d="M9 14h6" ${S}/>`, // pain
  `<path d="M6 4v16M18 4v16M6 12h12" ${S}/>`, // échelle
  `<path d="M12 21c-5-3-6-8-2-11s3-6 0-8" ${S}/><circle cx="10" cy="2.8" r="0.8" fill="currentColor"/>`, // cobra
  `<path d="M4 18h16M6 18V9h12v9M9 9V5h6v4" ${S}/>`, // temple
  `<path d="M4 10h16M12 10v11M7 21h10M8 10l4-7 4 7" ${S}/>`, // balance
  `<path d="M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5" ${S}/>`, // flèches
  `<path d="M12 3c5 0 7 4 7 8s-3 8-7 10c-4-2-7-6-7-10s2-8 7-8z" ${S}/><path d="M12 7v10" ${S}/>`, // scarabée
  `<path d="M4 6c4 0 4 6 8 6s4-6 8-6M4 14c4 0 4 6 8 6s4-6 8-6" ${S}/>`, // corde
  `<rect x="5" y="5" width="14" height="14" rx="2" ${S}/><path d="M9 9h6v6H9z" ${S}/>`, // cour
  `<path d="M3 20c3-10 15-10 18 0" ${S}/><path d="M12 13v7" ${S}/>`, // colline
  `<path d="M6 21V10l6-7 6 7v11" ${S}/><path d="M10 21v-5h4v5" ${S}/>`, // obélisque
  `<path d="M4 8h16v3H4zM7 11v9M17 11v9" ${S}/>`, // tabouret
  `<circle cx="7" cy="12" r="3" ${S}/><circle cx="17" cy="12" r="3" ${S}/><path d="M10 12h4" ${S}/>`, // lunettes
  `<path d="M12 3v18M6 7l6 4 6-4M6 14l6 4 6-4" ${S}/>`, // plume
  `<path d="M12 4a8 8 0 1 0 8 8 5 5 0 1 1-5-5" ${S}/>`, // spirale
  `<path d="M5 5l14 14M19 5L5 19" ${S}/><rect x="3" y="3" width="18" height="18" rx="3" ${S}/>`, // sceau
  `<path d="M8 21V5M16 21V5M8 5c-2 0-3-2-3-2M16 5c2 0 3-2 3-2" ${S}/>`, // deux roseaux
  `<path d="M3 12h18" ${S}/><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>`, // verrou
];

export default function Hieroglyphe({ id, className = "h-8 w-8" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: DESSINS[id % DESSINS.length] }} />
  );
}
