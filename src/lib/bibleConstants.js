export const HIGHLIGHT_COLORS = [
  { id: "green", swatch: "bg-green-500", verse: "bg-green-400/25" },
  { id: "pink", swatch: "bg-pink-500", verse: "bg-pink-400/25" },
  { id: "yellow", swatch: "bg-yellow-500", verse: "bg-yellow-400/25" },
  { id: "blue", swatch: "bg-blue-500", verse: "bg-blue-400/25" },
  { id: "brown", swatch: "bg-amber-700", verse: "bg-amber-600/25" },
  { id: "purple", swatch: "bg-purple-500", verse: "bg-purple-400/25" },
];

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