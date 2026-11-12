// Cadre de rognage CARRÉ (photo de profil) : le membre déplace le cadre et le redimensionne par ses coins.
// Coordonnées en pixels de l'image AFFICHÉE (largeur dispW, hauteur dispH) ; cadre = { x, y, c } (côté c).

export const COTE_MIN = 48; // côté minimal affiché du cadre (pixels d'écran)

const borner = (v, min, max) => Math.min(Math.max(v, min), max);

/** Plus grand carré centré (90 % du petit côté) : point de départ visible du rognage. */
export function cadreInitial(dispW, dispH) {
  const c = Math.round(Math.min(dispW, dispH) * 0.9);
  return { x: Math.round((dispW - c) / 2), y: Math.round((dispH - c) / 2), c };
}

/** Déplacement du cadre de (dx, dy), sans sortir de l'image. */
export function deplacerCadre(cadre, dx, dy, dispW, dispH) {
  return {
    x: borner(cadre.x + dx, 0, dispW - cadre.c),
    y: borner(cadre.y + dy, 0, dispH - cadre.c),
    c: cadre.c,
  };
}

/**
 * Redimensionnement par un coin ("hg", "hd", "bg", "bd") : le coin opposé reste fixe, le cadre reste carré
 * (le plus grand des deux déplacements l'emporte) et dans l'image ; côté minimal COTE_MIN.
 */
export function redimensionnerCadre(cadre, coin, dx, dy, dispW, dispH, min = COTE_MIN) {
  const droite = coin === "hd" || coin === "bd";
  const bas = coin === "bg" || coin === "bd";
  // Coin fixe (opposé).
  const fx = droite ? cadre.x : cadre.x + cadre.c;
  const fy = bas ? cadre.y : cadre.y + cadre.c;
  const vx = (droite ? 1 : -1) * dx;
  const vy = (bas ? 1 : -1) * dy;
  const delta = Math.abs(vx) >= Math.abs(vy) ? vx : vy;
  const place = Math.min(droite ? dispW - fx : fx, bas ? dispH - fy : fy);
  const c = borner(cadre.c + delta, Math.min(min, place), place);
  return { x: droite ? fx : fx - c, y: bas ? fy : fy - c, c };
}

/** Zone de l'image d'origine (pixels réels) correspondant au cadre : { sx, sy, sW, sH } (carré). */
export function sourceDuCadre(cadre, dispW, natural) {
  const echelle = natural.w / dispW;
  const s = Math.round(cadre.c * echelle);
  return {
    sx: borner(Math.round(cadre.x * echelle), 0, natural.w - s),
    sy: borner(Math.round(cadre.y * echelle), 0, natural.h - s),
    sW: s,
    sH: s,
  };
}

/** Taille d'affichage de l'image dans une zone maxW x maxH (proportions gardées). */
export function tailleAffichage(natural, maxW, maxH) {
  const e = Math.min(maxW / natural.w, maxH / natural.h, 1e9);
  return { dispW: Math.round(natural.w * e), dispH: Math.round(natural.h * e) };
}
