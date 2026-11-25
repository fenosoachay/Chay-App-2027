// Texte qui défile sur la photo des lecteurs (1.3.26) : Admin › Multimédia › Texte qui défile (TexteDefilant).
// Pur (testé par texteDefilant.test.js) : quels textes montrer pour le titre en cours, et comment.

/** Lecteur du titre en cours (mediaType de la file de lecture) -> valeur du champ « Apparaît où ? ». */
export function lecteurDe(piste) {
  const t = piste?.mediaType;
  if (t === "music") return "musique";
  if (t === "sermons") return "predication";
  if (t === "bible") return "bible";
  return null;
}

/** « AAAA-MM-JJ » du jour, heure locale. */
export function jourLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const jour = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");

/**
 * Textes à afficher pour `piste`, dans l'ordre de l'admin.
 * `parents` : Map playlist -> playlist parente (une playlist choisie par l'admin vaut aussi pour ses sous-playlists).
 */
export function textesPour(rows, piste, { aujourdhui = jourLocal(), parents = new Map() } = {}) {
  const lecteur = lecteurDe(piste);
  if (!lecteur) return [];
  const playlist = piste.playlist_id || "";
  const parent = playlist ? parents.get(playlist) || "" : "";
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && String(r.texte || "").trim())
    .filter((r) => r.ou === "partout" || r.ou === lecteur)
    .filter((r) => !jour(r.debut) || jour(r.debut) <= aujourdhui)
    .filter((r) => !jour(r.fin) || aujourdhui <= jour(r.fin))
    .filter((r) => !r.track_id || r.track_id === piste.id)
    .filter((r) => !r.playlist_id || r.playlist_id === playlist || (parent && r.playlist_id === parent))
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999))
    .map((r) => ({
      id: r.id,
      texte: String(r.texte).replace(/\s+/g, " ").trim(),
      direction: r.direction === "monte" ? "monte" : "gauche",
      couleur: COULEURS[r.couleur] || COULEURS.blanc,
      vitesse: VITESSES[r.vitesse] || VITESSES.normal,
    }));
}

export const COULEURS = { blanc: "#FFFFFF", dore: "#E8C478", jaune: "#FFD23F", rose: "#FF8AC8", bleu: "#9CC3FF" };
/** Pixels par seconde. */
export const VITESSES = { lent: 28, normal: 45, rapide: 75 };

/** Durée d'un passage (s) : distance à parcourir / vitesse, au moins 4 s. */
export function dureePassage(distancePx, pxParSeconde) {
  const v = pxParSeconde > 0 ? pxParSeconde : VITESSES.normal;
  return Math.max(4, Math.round((Math.max(0, distancePx) / v) * 10) / 10);
}

/** Une playlist doit-elle être connue (sous-playlists) ? Seulement si un texte vise une playlist. */
export const besoinPlaylists = (rows) => (Array.isArray(rows) ? rows : []).some((r) => r && r.playlist_id);

/**
 * 1.3.34 : deux bandes horizontales sur la photo : en bas de droite à gauche, en haut de gauche à droite.
 * « gauche » -> bande du bas, « monte » -> bande du haut (valeurs gardées pour les textes existants).
 * Une bande vide reprend des textes de l'autre : plusieurs textes se partagent les deux bandes ; un seul texte
 * passe dans les deux (le même texte en haut et en bas).
 */
export function bandes(textes) {
  const liste = Array.isArray(textes) ? textes : [];
  let bas = liste.filter((t) => t.direction !== "monte");
  let haut = liste.filter((t) => t.direction === "monte");
  if (!haut.length && bas.length > 1) { haut = bas.filter((_, i) => i % 2 === 1); bas = bas.filter((_, i) => i % 2 === 0); }
  else if (!bas.length && haut.length > 1) { bas = haut.filter((_, i) => i % 2 === 1); haut = haut.filter((_, i) => i % 2 === 0); }
  if (!haut.length) haut = bas;
  if (!bas.length) bas = haut;
  return { haut, bas };
}
