// 1.3.34 : mouvement des bulles des jeux (src/components/jeux/EauxProfondes.jsx). Calculs purs, testés.
// Chaque bulle dérive doucement (courant d'eau), suit l'inclinaison du téléphone, rebondit mollement sur
// les bords et sur les autres bulles. Elle ne s'arrête jamais : le courant la relance toujours.

/** Bulles réparties sans se chevaucher ; `avant` garde les positions (redimensionnement). */
export function creerBulles(n, largeur, hauteur, r, avant = []) {
  const cols = Math.max(1, Math.min(n, Math.floor(largeur / (r * 2.4)) || 1));
  const lignes = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => {
    const a = avant[i];
    const col = i % cols;
    const lig = Math.floor(i / cols);
    const x0 = ((col + 0.5) / cols) * largeur + (lig % 2 ? r * 0.4 : -r * 0.4);
    const y0 = ((lig + 0.5) / lignes) * hauteur;
    return {
      x: borne(a ? a.x : x0, r, largeur - r),
      y: borne(a ? a.y : y0, r, hauteur - r),
      vx: a ? a.vx : Math.cos(i * 2.1) * 0.4,
      vy: a ? a.vy : Math.sin(i * 1.7) * 0.4,
      r,
      phase: i * 1.37,
      s: 1,
    };
  });
}

const borne = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Une image : { t (ms), dt (≈1 à 60 i/s), largeur, hauteur, tilt: {x,y} entre -1 et 1 }.
 * Renvoie de nouvelles bulles (l'entrée n'est pas modifiée).
 */
export function bougerBulles(bulles, { t, dt = 1, largeur, hauteur, tilt = { x: 0, y: 0 } }) {
  const nb = bulles.map((b) => ({ ...b }));
  for (const b of nb) {
    // Courant : une poussée qui tourne lentement, propre à chaque bulle.
    const ang = t * 0.0005 + b.phase;
    b.vx += (Math.cos(ang) * 0.018 + tilt.x * 0.045) * dt;
    b.vy += (Math.sin(ang * 1.3) * 0.018 + tilt.y * 0.045 - 0.004) * dt;
    // Les bords repoussent doucement : une bulle ne reste pas collée dans un coin.
    const marge = b.r * 0.6;
    const pousse = 0.03 * (1 - Math.min(1, Math.abs(tilt.x) + Math.abs(tilt.y)) * 0.7);
    if (b.x < b.r + marge) b.vx += pousse * dt;
    if (b.x > largeur - b.r - marge) b.vx -= pousse * dt;
    if (b.y < b.r + marge) b.vy += pousse * dt;
    if (b.y > hauteur - b.r - marge) b.vy -= pousse * dt;
    // Eau : freine, sans jamais arrêter.
    b.vx *= Math.pow(0.975, dt);
    b.vy *= Math.pow(0.975, dt);
    const v = Math.hypot(b.vx, b.vy);
    const max = 1.6;
    if (v > max) { b.vx *= max / v; b.vy *= max / v; }
    if (v < 0.12) { b.vx += Math.cos(ang) * 0.03; b.vy += Math.sin(ang) * 0.03; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Bords : rebond mou.
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > largeur - b.r) { b.x = largeur - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y > hauteur - b.r) { b.y = hauteur - b.r; b.vy = -Math.abs(b.vy) * 0.6; }
    // Respiration : la bulle gonfle et dégonfle à peine.
    b.s = 1 + Math.sin(t * 0.002 + b.phase * 2) * 0.035;
  }
  // Bulles entre elles : on les écarte doucement.
  for (let i = 0; i < nb.length; i++) {
    for (let j = i + 1; j < nb.length; j++) {
      const a = nb[i];
      const b = nb[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + 4;
      if (d < min) {
        const ux = dx / d;
        const uy = dy / d;
        const pousse = (min - d) / 2;
        a.x -= ux * pousse; a.y -= uy * pousse;
        b.x += ux * pousse; b.y += uy * pousse;
        const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
        if (rel < 0) {
          a.vx += ux * rel * 0.5; a.vy += uy * rel * 0.5;
          b.vx -= ux * rel * 0.5; b.vy -= uy * rel * 0.5;
        }
      }
    }
  }
  for (const b of nb) { b.x = borne(b.x, b.r, largeur - b.r); b.y = borne(b.y, b.r, hauteur - b.r); }
  return nb;
}
