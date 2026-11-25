// Chay Fronde (1.3.32, Chay PlayMobile) : moteur du jeu, pur (testé par fronde.test.js), sans bibliothèque.
// Monde de 760 × 620 (unités), sol à y = 580. Corps : pierres et cibles (cercles), planches et poteaux
// (rectangles qui ne tournent pas : ils glissent, tombent et s'empilent). Une cible touchée assez fort
// (pierre, planche qui tombe, chute) disparaît dans un pouf d'étoiles. Une planche frappée fort se casse.

export const LARGEUR = 760;
export const HAUTEUR = 620;
export const SOL = 580;
export const FRONDE = { x: 110, y: 470 };
export const TIRAGE_MAX = 95;
export const PUISSANCE = 9.5;
const G = 900;
const R_PIERRE = 13;
const R_CIBLE = 21;
const SEUIL_CIBLE = 190; // vitesse d'impact qui fait disparaître une cible
const SEUIL_BOIS = 330; // vitesse d'impact qui abîme une planche
const MATERIAUX = { bois: { pv: 100, densite: 1, couleur: "#C8913E" }, pierre: { pv: 260, densite: 2.2, couleur: "#9AA3AE" } };

let compteur = 0;
const id = () => { compteur += 1; return compteur; };

/** Un étage de tour : deux poteaux et une planche dessus ; renvoie { blocs, haut } (haut = y du dessus). */
function etage(x, bas, largeur, hauteur, materiau) {
  const poteau = { w: 16, h: hauteur };
  const planche = { w: largeur, h: 16 };
  const blocs = [
    { x: x - largeur / 2 + poteau.w / 2, y: bas - poteau.h / 2, ...poteau, materiau },
    { x: x + largeur / 2 - poteau.w / 2, y: bas - poteau.h / 2, ...poteau, materiau },
    { x, y: bas - poteau.h - planche.h / 2, ...planche, materiau },
  ];
  return { blocs, haut: bas - poteau.h - planche.h };
}

/**
 * Tour de `etages` étages, centrée en x. `cibles` : étages (1 = rez-de-chaussée, etages + 1 = sur le toit)
 * où se trouve une cible. `materiaux` : matériau de chaque étage (sinon bois).
 */
function tour(x, etages, largeur, cibles, materiaux = []) {
  const blocs = [];
  const cib = [];
  let bas = SOL;
  for (let k = 1; k <= etages; k += 1) {
    if (cibles.includes(k)) cib.push({ x, y: bas - R_CIBLE });
    const e = etage(x, bas, largeur, 70, materiaux[k - 1] || "bois");
    blocs.push(...e.blocs);
    bas = e.haut;
  }
  if (cibles.includes(etages + 1)) cib.push({ x, y: bas - R_CIBLE });
  return { blocs, cibles: cib };
}

// 20 niveaux, du plus facile au plus difficile : [x, étages, largeur, étages avec cible, matériaux], pierres.
const P = "pierre";
const B = "bois";
export const NIVEAUX = [
  { tours: [[560, 1, 90, [1]]], pierres: 3 },
  { tours: [[580, 1, 100, [2]]], pierres: 3 },
  { tours: [[560, 2, 100, [1, 3]]], pierres: 3 },
  { tours: [[480, 1, 90, [1]], [640, 1, 90, [2]]], pierres: 3 },
  { tours: [[580, 3, 100, [1, 3]]], pierres: 4 },
  { tours: [[470, 2, 90, [2]], [640, 1, 90, [1, 2]]], pierres: 4 },
  { tours: [[450, 1, 80, [1]], [560, 2, 80, [3]], [670, 1, 80, [2]]], pierres: 4 },
  { tours: [[560, 2, 110, [1, 2], [P, B]]], pierres: 4 },
  { tours: [[500, 3, 90, [1, 4]], [660, 2, 90, [2]]], pierres: 5 },
  { tours: [[560, 4, 110, [1, 3, 5]]], pierres: 4 },
  { tours: [[460, 2, 90, [1], [P, B]], [640, 3, 90, [2, 4]]], pierres: 4 },
  { tours: [[440, 1, 80, [2]], [550, 3, 80, [1, 3]], [660, 1, 80, [1]]], pierres: 5 },
  { tours: [[560, 3, 120, [1, 2, 4], [P, P, B]]], pierres: 4 },
  { tours: [[480, 4, 90, [2, 5]], [650, 4, 90, [1, 3]]], pierres: 6 },
  { tours: [[450, 2, 80, [1, 3], [P, B]], [560, 4, 80, [2, 5]], [670, 2, 80, [3], [B, B]]], pierres: 6 },
  { tours: [[560, 5, 110, [1, 3, 6], [P, B, B, P, B]]], pierres: 5 },
  { tours: [[470, 3, 100, [1, 4], [P, P, B]], [650, 3, 100, [2, 3], [B, P, P]]], pierres: 6 },
  { tours: [[430, 2, 80, [3]], [540, 4, 80, [1, 4]], [650, 4, 80, [2, 5], [P, B, P, B]]], pierres: 6 },
  { tours: [[500, 5, 100, [1, 3, 6], [P, P, B, B, P]], [670, 3, 90, [2, 4], [P, B, P]]], pierres: 6 },
  { tours: [[430, 3, 80, [4], [B, B, P]], [550, 4, 90, [2, 5], [P, B, B, B]], [670, 3, 80, [4], [B, B, B]]], pierres: 7 },
];

/** Monde de départ du niveau `n` (0..19). `photos` : images à mettre sur les cibles (dans l'ordre). */
export function creerMonde(n, photos = []) {
  const niv = NIVEAUX[n];
  const blocs = [];
  const cibles = [];
  for (const [x, etages, largeur, c, mat] of niv.tours) {
    const t = tour(x, etages, largeur, c, mat);
    blocs.push(...t.blocs);
    cibles.push(...t.cibles);
  }
  return {
    blocs: blocs.map((b) => ({ ...b, id: id(), vx: 0, vy: 0, pv: MATERIAUX[b.materiau].pv, masse: (b.w * b.h * MATERIAUX[b.materiau].densite) / 400 })),
    cibles: cibles.map((c, i) => ({ ...c, id: id(), r: R_CIBLE, vx: 0, vy: 0, masse: 2.2, photo: photos.length ? photos[i % photos.length] : null })),
    pierres: [],
    poufs: [],
    eclats: [],
    reste: niv.pierres,
    temps: 0,
  };
}

/** Vitesse de lancement d'après le tirage (vecteur du centre de la fronde vers le doigt). */
export function lancement(dx, dy) {
  const d = Math.hypot(dx, dy);
  const k = d > TIRAGE_MAX ? TIRAGE_MAX / d : 1;
  return { vx: -dx * k * PUISSANCE, vy: -dy * k * PUISSANCE };
}

/** Points de la trajectoire prévue (pour viser). */
export function trajectoire(vx, vy, n = 18, pas = 0.06) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 1) * pas;
    return { x: FRONDE.x + vx * t, y: FRONDE.y + vy * t + (G * t * t) / 2 };
  });
}

export function tirer(monde, dx, dy) {
  if (monde.reste <= 0) return monde;
  const v = lancement(dx, dy);
  monde.pierres.push({ id: id(), x: FRONDE.x, y: FRONDE.y, r: R_PIERRE, masse: 6, ...v, vie: 0 });
  monde.reste -= 1;
  return monde;
}

// ── Collisions ───────────────────────────────────────────────────────────────
function choc(a, b, nx, ny, profondeur, restitution) {
  // Séparation (proportionnelle aux masses), puis impulsion le long de la normale + frottement.
  const ma = a.fixe ? Infinity : a.masse;
  const mb = b.fixe ? Infinity : b.masse;
  const ia = Number.isFinite(ma) ? 1 / ma : 0;
  const ib = Number.isFinite(mb) ? 1 / mb : 0;
  const somme = ia + ib;
  if (!somme) return 0;
  const corr = Math.max(0, profondeur - 0.3) / somme * 0.8;
  a.x -= nx * corr * ia; a.y -= ny * corr * ia;
  b.x += nx * corr * ib; b.y += ny * corr * ib;
  const rvx = (b.vx || 0) - (a.vx || 0);
  const rvy = (b.vy || 0) - (a.vy || 0);
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return 0;
  const j = (-(1 + restitution) * vn) / somme;
  a.vx -= j * nx * ia; a.vy -= j * ny * ia;
  b.vx += j * nx * ib; b.vy += j * ny * ib;
  // Frottement
  const tx = -ny;
  const ty = nx;
  const vt = rvx * tx + rvy * ty;
  const jt = Math.max(-j * 0.5, Math.min(j * 0.5, -vt / somme));
  a.vx -= jt * tx * ia; a.vy -= jt * ty * ia;
  b.vx += jt * tx * ib; b.vy += jt * ty * ib;
  return -vn; // vitesse d'impact
}

function rectRect(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const px = (a.w + b.w) / 2 - Math.abs(dx);
  const py = (a.h + b.h) / 2 - Math.abs(dy);
  if (px <= 0 || py <= 0) return null;
  return px < py ? { nx: Math.sign(dx) || 1, ny: 0, p: px } : { nx: 0, ny: Math.sign(dy) || 1, p: py };
}

function cercleRect(c, r) {
  const qx = Math.max(r.x - r.w / 2, Math.min(c.x, r.x + r.w / 2));
  const qy = Math.max(r.y - r.h / 2, Math.min(c.y, r.y + r.h / 2));
  let dx = qx - c.x;
  let dy = qy - c.y;
  const d = Math.hypot(dx, dy);
  if (d >= c.r) return null;
  if (d < 1e-6) { // centre dans le rectangle : sortir par le côté le plus proche
    const gx = c.x - (r.x - r.w / 2);
    const dxr = r.x + r.w / 2 - c.x;
    const hy = c.y - (r.y - r.h / 2);
    const by = r.y + r.h / 2 - c.y;
    const m = Math.min(gx, dxr, hy, by);
    if (m === hy) return { nx: 0, ny: 1, p: c.r + hy };
    if (m === by) return { nx: 0, ny: -1, p: c.r + by };
    if (m === gx) return { nx: 1, ny: 0, p: c.r + gx };
    return { nx: -1, ny: 0, p: c.r + dxr };
  }
  dx /= d; dy /= d;
  return { nx: dx, ny: dy, p: c.r - d };
}

function cercleCercle(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= a.r + b.r || d < 1e-6) return null;
  return { nx: dx / d, ny: dy / d, p: a.r + b.r - d };
}

function pouf(monde, c) {
  monde.poufs.push({ x: c.x, y: c.y, t: 0, photo: c.photo });
  monde.cibleTouchee = (monde.cibleTouchee || 0) + 1;
}

/** Avance le monde de `dt` secondes. Renvoie des évènements { poufs, casses, chocs } (pour les sons). */
export function avancer(monde, dt) {
  const ev = { poufs: 0, casses: 0, chocs: 0 };
  const sous = 4;
  const h = Math.min(dt, 1 / 30) / sous;
  for (let s = 0; s < sous; s += 1) {
    const tous = [...monde.blocs, ...monde.cibles, ...monde.pierres];
    for (const o of tous) {
      o.vy += G * h;
      o.x += o.vx * h;
      o.y += o.vy * h;
    }
    for (let it = 0; it < 3; it += 1) {
      // Sol
      for (const o of tous) {
        const bas = o.r ? o.y + o.r : o.y + o.h / 2;
        if (bas > SOL) {
          const sol = { fixe: true, x: o.x, y: SOL + 50, vx: 0, vy: 0 };
          const v = choc(sol, o, 0, -1, bas - SOL, 0.15) || 0;
          o.y -= 0; // séparation faite par choc
          if (o.r === R_CIBLE && v > SEUIL_CIBLE + 60) o.mort = true;
          o.vx *= 0.985;
        }
      }
      // Blocs entre eux
      for (let i = 0; i < monde.blocs.length; i += 1) {
        for (let j = i + 1; j < monde.blocs.length; j += 1) {
          const a = monde.blocs[i];
          const b = monde.blocs[j];
          const c = rectRect(a, b);
          if (c) choc(a, b, c.nx, c.ny, c.p, 0.05);
        }
      }
      // Cercles (cibles, pierres) contre blocs
      for (const c of [...monde.cibles, ...monde.pierres]) {
        for (const b of monde.blocs) {
          const k = cercleRect(c, b);
          if (!k) continue;
          const v = choc(c, b, k.nx, k.ny, k.p, c.r === R_PIERRE ? 0.25 : 0.05);
          if (v > 80) ev.chocs += 1;
          if (v > SEUIL_BOIS) b.pv -= (v - SEUIL_BOIS) * (c.r === R_PIERRE ? 0.55 : 0.2);
          if (c.r === R_CIBLE && v > SEUIL_CIBLE) c.mort = true;
        }
      }
      // Cercles entre eux
      const cercles = [...monde.cibles, ...monde.pierres];
      for (let i = 0; i < cercles.length; i += 1) {
        for (let j = i + 1; j < cercles.length; j += 1) {
          const a = cercles[i];
          const b = cercles[j];
          const k = cercleCercle(a, b);
          if (!k) continue;
          const v = choc(a, b, k.nx, k.ny, k.p, 0.3);
          if (v > SEUIL_CIBLE * 0.8) { if (a.r === R_CIBLE) a.mort = true; if (b.r === R_CIBLE) b.mort = true; }
        }
      }
    }
    // Une planche qui tombe fort sur une cible : vitesse relative des blocs au contact
    for (const c of monde.cibles) {
      for (const b of monde.blocs) {
        const k = cercleRect({ ...c, r: c.r + 1 }, b);
        if (k && Math.hypot(b.vx - c.vx, b.vy - c.vy) > SEUIL_CIBLE * 1.1) c.mort = true;
      }
    }
  }
  // Repos : les petits tremblements des piles s'éteignent (sinon une tour haute vibre sans fin).
  for (const o of [...monde.blocs, ...monde.cibles]) {
    if (Math.hypot(o.vx, o.vy) < 14) { o.vx *= 0.4; o.vy *= 0.4; }
  }
  // Morts, casses, sorties
  monde.cibles = monde.cibles.filter((c) => {
    if (c.mort || c.y > HAUTEUR + 100 || c.x < -100 || c.x > LARGEUR + 100) { pouf(monde, c); ev.poufs += 1; return false; }
    return true;
  });
  monde.blocs = monde.blocs.filter((b) => {
    if (b.pv <= 0) { monde.eclats.push({ x: b.x, y: b.y, t: 0, couleur: MATERIAUX[b.materiau].couleur }); ev.casses += 1; return false; }
    return b.x > -200 && b.x < LARGEUR + 200 && b.y < HAUTEUR + 200;
  });
  for (const p of monde.pierres) p.vie += dt;
  monde.pierres = monde.pierres.filter((p) => p.x < LARGEUR + 60 && p.x > -60 && p.vie < 9);
  monde.poufs = monde.poufs.filter((p) => (p.t += dt) < 0.7);
  monde.eclats = monde.eclats.filter((p) => (p.t += dt) < 0.5);
  monde.temps += dt;
  return ev;
}

/** Tout est presque immobile ? (fin d'un tir) */
export function auRepos(monde) {
  const v = (o) => Math.hypot(o.vx, o.vy);
  return [...monde.blocs, ...monde.cibles].every((o) => v(o) < 12) && monde.pierres.every((p) => v(p) < 15 || p.vie > 6);
}

/** Étoiles : selon les pierres qui restent après la victoire. */
export const etoilesFronde = (reste) => (reste >= 2 ? 3 : reste === 1 ? 2 : 1);

/** Points d'un niveau réussi (même calcul que le serveur). */
export const pointsFronde = (n, etoiles) => (n >= 1 && n <= 20 && etoiles >= 1 && etoiles <= 3 ? (5 + n) * etoiles : 0);
