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
      direction: ANIMATIONS.some((a) => a.value === r.direction) ? r.direction : "gauche",
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
 * 1.3.34 : animations du texte (champ « Animation » de l'admin, valeur gardée dans `direction`).
 * « gauche » et « monte » gardent leur sens d'origine (textes existants).
 */
export const ANIMATIONS = [
  { value: "haut_droite", label: "Seulement en haut (de gauche à droite)" },
  { value: "haut_gauche", label: "Seulement en haut (de droite à gauche)" },
  { value: "bas_droite", label: "Seulement en bas (de gauche à droite)" },
  { value: "gauche", label: "Seulement en bas (de droite à gauche)" },
  { value: "deux_hg_bd", label: "Les deux en sens contraire : en haut vers la gauche, en bas vers la droite" },
  { value: "deux_hd_bg", label: "Les deux en sens contraire : en haut vers la droite, en bas vers la gauche" },
  { value: "descend", label: "Vertical : de haut en bas" },
  { value: "monte", label: "Vertical : de bas en haut" },
  { value: "mots", label: "Mot par mot, en fondu" },
  { value: "machine", label: "Machine à écrire" },
  { value: "respire", label: "Respiration (au centre, avec une lueur)" },
  { value: "varie", label: "Varié (une animation différente à chaque passage)" },
];

// Bandes horizontales : [bande, sens] ; « droite » = de gauche à droite.
const BANDES = {
  haut_droite: [["haut", "droite"]],
  haut_gauche: [["haut", "gauche"]],
  bas_droite: [["bas", "droite"]],
  gauche: [["bas", "gauche"]],
  deux_hg_bd: [["haut", "gauche"], ["bas", "droite"]],
  deux_hd_bg: [["haut", "droite"], ["bas", "gauche"]],
};
/** Animations du milieu de la photo, dans l'ordre de « Varié ». */
export const CENTRE = ["mots", "machine", "respire", "monte", "descend"];

/**
 * Où passe chaque texte : bandes du haut et du bas (avec leur sens ; le premier texte d'une bande donne le
 * sens), et le milieu (vertical, mot par mot, machine à écrire, respiration, varié), un texte après l'autre.
 */
export function disposition(textes) {
  const d = { haut: null, bas: null, centre: [] };
  for (const t of Array.isArray(textes) ? textes : []) {
    const bandes = BANDES[t.direction];
    if (!bandes) { d.centre.push(t); continue; }
    for (const [b, sens] of bandes) {
      if (!d[b]) d[b] = { sens, textes: [] };
      d[b].textes.push(t);
    }
  }
  return d;
}

/** Animation d'un passage au milieu : celle du texte, ou la suivante de la liste pour « Varié ». */
export const animationCentre = (t, passage = 0) => (t.direction === "varie" ? CENTRE[passage % CENTRE.length] : t.direction);

/**
 * Taille du texte au milieu selon sa longueur, en % de la largeur de la photo (cqw) : une phrase courte en grand,
 * un long texte plus petit ; toujours bien proportionné dans la case, quelle que soit sa taille à l'écran.
 */
export function tailleTexte(texte) {
  const n = String(texte || "").length;
  if (n <= 16) return "13cqw";
  if (n <= 32) return "10cqw";
  if (n <= 70) return "8cqw";
  if (n <= 130) return "6.5cqw";
  if (n <= 220) return "5.5cqw";
  return "4.5cqw";
}
