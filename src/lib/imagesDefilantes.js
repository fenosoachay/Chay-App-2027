// Image qui défile (1.3.34) : Admin › Multimédia › Lecteur audio › Image qui défile (ImageDefilante).
// Des groupes de photos d'un même format (carré, paysage, portrait, vertical) remplacent l'image du lecteur
// audio et s'animent (défilement horizontal, fondu enchaîné, défilement vertical). Pur, testé.
import { lecteurDe, jourLocal, secondesDe } from "./texteDefilant.js";

export const FORMATS = [
  { value: "carre", label: "Carré 1:1", ratio: 1 },
  { value: "paysage", label: "Paysage 16:9", ratio: 16 / 9 },
  { value: "portrait", label: "Portrait 4:5", ratio: 4 / 5 },
  { value: "vertical", label: "Vertical 9:16", ratio: 9 / 16 },
];
export const ANIMATIONS_IMAGES = [
  { value: "horizontal", label: "Défilement horizontal" },
  { value: "fondu", label: "Fondu enchaîné" },
  { value: "vertical", label: "Défilement vertical" },
];
export const ratioDe = (format) => (FORMATS.find((f) => f.value === format) || FORMATS[0]).ratio;
/** Secondes par photo selon la vitesse. */
export const SECONDES = { lent: 6, normal: 4, rapide: 2.5 };

const jour = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");

/** Groupes de photos à montrer pour `piste` (mêmes règles que le texte qui défile), dans l'ordre de l'admin. */
export function groupesPour(rows, piste, { aujourdhui = jourLocal(), parents = new Map() } = {}) {
  const lecteur = lecteurDe(piste);
  if (!lecteur) return [];
  const playlist = piste.playlist_id || "";
  const parent = playlist ? parents.get(playlist) || "" : "";
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && Array.isArray(r.images) && r.images.some((u) => typeof u === "string" && u))
    .filter((r) => r.ou === "partout" || r.ou === lecteur)
    .filter((r) => !jour(r.debut) || jour(r.debut) <= aujourdhui)
    .filter((r) => !jour(r.fin) || aujourdhui <= jour(r.fin))
    .filter((r) => !r.track_id || r.track_id === piste.id)
    .filter((r) => !r.playlist_id || r.playlist_id === playlist || (parent && r.playlist_id === parent))
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999))
    .map((r) => ({
      id: r.id,
      format: FORMATS.some((f) => f.value === r.format) ? r.format : "carre",
      ratio: ratioDe(r.format),
      animation: ANIMATIONS_IMAGES.some((a) => a.value === r.animation) ? r.animation : "fondu",
      images: r.images.filter((u) => typeof u === "string" && u),
      // 1.3.35 : secondes réglées à la main dans l'admin, sinon la vitesse (Lente / Normale / Rapide).
      secondes: secondesDe(r.secondes) || SECONDES[r.vitesse] || SECONDES.normal,
    }));
}

/** Taille d'une photo dans la case carrée (côté `cote`) : elle tient entière, bandes autour. */
export function tailleDansCase(ratio, cote) {
  return ratio >= 1 ? { w: cote, h: cote / ratio } : { w: cote * ratio, h: cote };
}

/** Durée d'un tour complet d'un groupe (s). */
export const dureeGroupe = (g) => Math.max(1, g.images.length * g.secondes);

