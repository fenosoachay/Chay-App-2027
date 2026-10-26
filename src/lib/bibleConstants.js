// Couleurs de surlignage (highlight). Chaque couleur définit une paire :
//   - `light` : teinte appliquée en mode bright (clair)
//   - `dark`  : teinte appliquée en mode dark (sombre)
// L'ordre est conservé : la ième couleur bright correspond à la ième dark.
// Les ids historiques sont gardés pour rester compatibles avec les
// annotations déjà enregistrées (highlight_color stocké = id).
export const HIGHLIGHT_COLORS = [
  { id: "yellow", light: "#FFF2A6", dark: "#6B5500" }, // jaune
  { id: "green", light: "#C6F6D5", dark: "#205C3B" },  // vert
  { id: "cyan", light: "#B2F0F0", dark: "#155E68" },   // cyan
  { id: "purple", light: "#F0C6F5", dark: "#713B79" }, // violet
  { id: "red", light: "#FFD1D1", dark: "#862D35" },    // rouge
  { id: "gray", light: "#E0E0E0", dark: "#454B54" },   // gris
];

// Retourne la couleur hexadécimale adaptée au mode courant ("bright" | "dark").
export function highlightHex(color, isDark) {
  if (!color) return undefined;
  return isDark ? color.dark : color.light;
}

// Langues proposées dans le lecteur (étiquettes courtes, sans drapeau).
export const LANGUAGES = [
  { id: "fr", label: "FR" },
  { id: "mg", label: "MG" },
];

// Textes bibliques : toujours lus depuis les fichiers locaux
// (public/data/bibles, voir src/lib/localBible.js). L'`id` est l'identifiant
// de traduction stocké avec les annotations (surlignages / notes) : il reste
// inchangé pour conserver celles déjà enregistrées.
export const VERSIONS = {
  fr: [
    {
      id: "fra_lsg",
      lang: "fr",
      label: "Louis Segond 1910 (LSG)",
      attribution: "Texte Louis Segond 1910 (domaine public).",
    },
  ],
  mg: [
    {
      id: "mg",
      lang: "mg",
      label: "Bible Malgache (Baiboly Masina)",
      attribution: "Baiboly Malagasy 1865.",
    },
  ],
};