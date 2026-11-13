// Multimédia (1.3.9) : ordre choisi par l'admin et vu par tous les membres, pour les listes qui n'ont pas de champ
// `order` dans leur collection : sections du multimédia (grille), vidéos des sections YouTube, photos des sections
// de la Galerie. Une ligne MediaOrder par liste : { key, ids } (ids = identifiants dans l'ordre).
// (Musique, Prédication, Articles, contenus des sous-playlists, Actualité chrétienne et Fonds d'écran gardent leur
// champ `order`.) Fichier pur, testé par node --test.

export const CLE_SECTIONS = "sections";
export const cleYoutube = (section) => `youtube:${section}`;
export const cleGalerie = (section) => `galerie:${section || "non-classees"}`;
export const CLE_VALIDE = /^[a-z0-9:_-]{1,60}$/;

/** Identifiants valides, sans doublon (texte, 1 à 64 caractères), 5 000 au plus. */
export function nettoyerIds(ids) {
  const vus = new Set();
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const s = typeof id === "string" ? id : "";
    if (!s || s.length > 64 || vus.has(s)) continue;
    vus.add(s);
    out.push(s);
    if (out.length >= 5000) break;
  }
  return out;
}

/**
 * Éléments dans l'ordre enregistré. Les éléments absents de l'ordre (contenus ajoutés depuis) sont placés EN TÊTE
 * (`nouveauxEnTete`, défaut : le plus récent d'abord, comme avant) ou à la fin, dans leur ordre d'origine.
 */
export function appliquerOrdre(items, ids, { nouveauxEnTete = true, idDe = (x) => x?.id } = {}) {
  const liste = Array.isArray(items) ? items : [];
  const ordre = nettoyerIds(ids);
  if (!ordre.length) return liste;
  const rang = new Map(ordre.map((id, i) => [id, i]));
  const connus = liste.filter((x) => rang.has(idDe(x))).sort((a, b) => rang.get(idDe(a)) - rang.get(idDe(b)));
  const nouveaux = liste.filter((x) => !rang.has(idDe(x)));
  return nouveauxEnTete ? [...nouveaux, ...connus] : [...connus, ...nouveaux];
}

/** Lignes MediaOrder -> Map(clé -> ids). */
export function ordresParCle(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r && CLE_VALIDE.test(String(r.key || ""))) m.set(r.key, nettoyerIds(r.ids));
  }
  return m;
}
