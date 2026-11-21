// Zoom des photos (1.3.23) : calculs purs (testés par node --test), utilisés par ZoomImage.
// État : { s (échelle, 1 = taille normale), x, y (décalage en pixels depuis le centre) }.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
export const ZOOM_DOUBLE = 2.5; // double-toucher / double-clic

export const bornerEchelle = (s) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(s) || 1));

/**
 * Zoom autour d'un point (relatif au centre du cadre) : ce point reste sous le doigt / la souris.
 * etat : { s, x, y } ; point : { x, y } ; s2 : nouvelle échelle (bornée).
 */
export function zoomerAutour(etat, point, s2) {
  const s = bornerEchelle(s2);
  if (s === 1) return { s: 1, x: 0, y: 0 };
  const k = s / etat.s;
  return { s, x: point.x - (point.x - etat.x) * k, y: point.y - (point.y - etat.y) * k };
}

/** Empêche la photo agrandie de sortir du cadre : l'image (l × h à l'échelle 1) reste au contact des bords. */
export function limiter(etat, l, h, cadreL, cadreH) {
  if (etat.s <= 1) return { s: 1, x: 0, y: 0 };
  const maxX = Math.max(0, (l * etat.s - cadreL) / 2);
  const maxY = Math.max(0, (h * etat.s - cadreH) / 2);
  return {
    s: etat.s,
    x: Math.min(maxX, Math.max(-maxX, etat.x)),
    y: Math.min(maxY, Math.max(-maxY, etat.y)),
  };
}

/**
 * Adresse de la photo en grande taille : sans la vignette réduite de PocketBase (?thumb=…).
 */
export function adresseGrande(src) {
  const brut = String(src || "");
  if (!/^https?:\/\//i.test(brut) || !brut.includes("thumb=")) return brut;
  try {
    const u = new URL(brut);
    u.searchParams.delete("thumb");
    return u.toString();
  } catch {
    return brut;
  }
}

/**
 * Faut-il ouvrir la visionneuse en touchant cette image ? (décision sur des faits simples, testable)
 * f : { interactif (bouton, lien, champ… ou [data-sans-zoom] autour), curseur, largeur, hauteur, src }
 */
export function photoZoomable(f) {
  if (!f || f.interactif) return false;
  if (["pointer", "zoom-in", "grab", "grabbing", "move"].includes(f.curseur)) return false; // a déjà une action
  if (!(f.largeur >= 24 && f.hauteur >= 24)) return false; // icônes, pastilles
  return Boolean(f.src);
}
