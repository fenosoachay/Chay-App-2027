// Accueil de l'app › liens ronds en bas (1.3.25) : liste modifiable dans Administration › Application › Contenu ›
// Accueil › « Liens des sites en bas » (collection LienAccueil). Fichier pur, testé par node --test.

export const LIENS_PAR_DEFAUT = [
  { label: "Site Web Église Chay", url: "https://www.chay.fr/", icone: "site" },
  { label: "Facebook", url: "https://www.facebook.com/www.chay.fr", icone: "facebook" },
  { label: "YouTube", url: "https://www.youtube.com/@EgliseChay.fr-tv", icone: "youtube" },
  { label: "TikTok", url: "https://www.tiktok.com/@anjahamintsoa", icone: "tiktok" },
];

const ICONES = ["site", "facebook", "youtube", "tiktok", "instagram", "whatsapp"];

/** Lignes LienAccueil -> liens affichables (https seulement, dans l'ordre de l'admin). Liste vide = par défaut. */
export function liensAffiches(rows) {
  if (!Array.isArray(rows)) return LIENS_PAR_DEFAUT;
  return rows
    .filter((r) => r && /^https:\/\/[^\s]+$/i.test(String(r.url || "").trim()) && String(r.label || "").trim())
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((r) => ({ label: String(r.label).trim(), url: String(r.url).trim(), icone: ICONES.includes(r.icone) ? r.icone : "site" }));
}
