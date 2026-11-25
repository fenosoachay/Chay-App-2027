// Chay Fronde (1.3.32, Chay PlayMobile) : moteur du jeu, pur (testé par fronde.test.js), sans bibliothèque.
// 1.3.34 : 60 niveaux (10 à 60 générés et vérifiés : src/data/niveauxFronde.js), pierres de formes et de
// tailles différentes imposées par le niveau (galet, caillou, rocher, silex), murs de pierre, décors variés.
// Monde de 760 × 620 (unités), sol à y = 580. Corps : pierres et cibles (cercles), planches et poteaux
// (rectangles qui ne tournent pas : ils glissent, tombent et s'empilent). Une cible touchée assez fort
// (pierre, planche qui tombe, chute) disparaît dans un pouf d'étoiles. Une planche frappée fort se casse.

import niveauxGeneres from "../data/niveauxFronde.js";

export const LARGEUR = 760;
export const HAUTEUR = 620;
export const SOL = 580;
export const FRONDE = { x: 110, y: 470 };
export const TIRAGE_MAX = 95;
export const PUISSANCE = 9.5;
const G = 900;
const R_CIBLE = 21;

/**
 * Pierres (1.3.34). r : taille ; puissance : vitesse au lancer ; bois / pierre : dégâts sur ce matériau ;
 * rebond : élasticité. La forme (polygone irrégulier) est seulement dessinée ; le choc reste celui d'un cercle.
 */
export const TYPES_PIERRE = {
  galet: { nom: "Galet", r: 13, masse: 6, puissance: 1, bois: 0.55, pierre: 0.5, rebond: 0.25, cotes: 9, creux: 0.12, couleur: ["#c9ced4", "#5f6670"] },
  caillou: { nom: "Caillou", r: 9, masse: 3, puissance: 1.2, bois: 0.35, pierre: 0.22, rebond: 0.35, cotes: 6, creux: 0.25, couleur: ["#e3d3b5", "#8b7650"] },
  rocher: { nom: "Rocher", r: 19, masse: 15, puissance: 0.84, bois: 0.95, pierre: 1.05, rebond: 0.08, cotes: 11, creux: 0.18, couleur: ["#a9a29a", "#4a4540"] },
  silex: { nom: "Silex", r: 12, masse: 5, puissance: 1.06, bois: 1.6, pierre: 0.3, rebond: 0.12, cotes: 5, creux: 0.45, pointe: true, couleur: ["#b9c4d8", "#3c4660"] },
};

/** Contour d'une pierre : facteurs de rayon (déterministes, d'après la graine). */
export function formePierre(type, graine = 1) {
  const t = TYPES_PIERRE[type] || TYPES_PIERRE.galet;
  let g = graine * 9301 + 49297;
  const alea = () => { g = (g * 9301 + 49297) % 233280; return g / 233280; };
  return Array.from({ length: t.cotes }, (_, i) => {
    if (t.pointe && i === 0) return 1.45; // la pointe du silex
    return 1 - t.creux / 2 + alea() * t.creux;
  });
}
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
function tour(x, etages, largeur, cibles, materiaux = [], hauteurEtage = 70) {
  const blocs = [];
  const cib = [];
  let bas = SOL;
  for (let k = 1; k <= etages; k += 1) {
    if (cibles.includes(k)) cib.push({ x, y: bas - R_CIBLE });
    const e = etage(x, bas, largeur, hauteurEtage, materiaux[k - 1] || "bois");
    blocs.push(...e.blocs);
    bas = e.haut;
  }
  if (cibles.includes(etages + 1)) cib.push({ x, y: bas - R_CIBLE });
  return { blocs, cibles: cib };
}

// Niveaux : tours [x, étages, largeur, étages avec cible, matériaux, hauteur d'étage], murs [x, hauteur, matériau]
// et la suite des pierres (dans l'ordre du tir). 1 à 9 : apprentissage ; 10 à 60 : générés puis vérifiés
// (scripts/genererNiveauxFronde.mjs) : chaque niveau tient debout seul et se gagne avec ses pierres.
const P = "pierre";
const B = "bois";
const g = "galet";
const c = "caillou";
const ro = "rocher";
const si = "silex";
const DEBUT = [
  { tours: [[560, 1, 90, [1]]], pierres: [g, g, g] },
  { tours: [[580, 1, 100, [2]]], pierres: [g, g, g] },
  { tours: [[560, 2, 100, [1, 3]]], pierres: [g, g, g] },
  { tours: [[480, 1, 90, [1]], [640, 1, 90, [2]]], pierres: [c, c, g] },
  { tours: [[580, 3, 100, [1, 3]]], pierres: [g, c, g, c] },
  { tours: [[470, 2, 90, [2]], [640, 1, 90, [1, 2]]], pierres: [ro, g, c, g] },
  { tours: [[450, 1, 80, [1]], [560, 2, 80, [3]], [670, 1, 80, [2]]], pierres: [c, c, g, g] },
  { tours: [[560, 2, 110, [1, 2], [P, B]]], pierres: [si, ro, g, g] },
  { tours: [[500, 3, 90, [1, 4]], [660, 2, 90, [2]]], pierres: [si, g, c, ro, g] },
];
export const NIVEAUX = [...DEBUT, ...niveauxGeneres];

/** Décor du niveau (change tous les 3 niveaux) : jour, forêt, coucher, montagne, désert, palais, nuit, neige. */
export const DECORS = ["jour", "foret", "coucher", "montagne", "desert", "palais", "nuit", "neige"];
export const decorNiveau = (n) => DECORS[Math.floor(n / 3) % DECORS.length];

/** Monde de départ du niveau `n` (0..59), ou d'un niveau donné. `photos` : images des cibles (dans l'ordre). */
export function creerMonde(n, photos = [], niveau = null) {
  const niv = niveau || NIVEAUX[n];
  const blocs = [];
  const cibles = [];
  for (const [x, etages, largeur, cib, mat, he] of niv.tours) {
    const t = tour(x, etages, largeur, cib, mat, he || 70);
    blocs.push(...t.blocs);
    cibles.push(...t.cibles);
  }
  for (const [x, h, mat] of niv.murs || []) blocs.push({ x, y: SOL - h / 2, w: 20, h, materiau: mat || "pierre" });
  const file = Array.isArray(niv.pierres) ? [...niv.pierres] : Array.from({ length: niv.pierres }, () => "galet");
  return {
    blocs: blocs.map((b) => ({ ...b, id: id(), vx: 0, vy: 0, pv: MATERIAUX[b.materiau].pv, masse: (b.w * b.h * MATERIAUX[b.materiau].densite) / 400 })),
    cibles: cibles.map((c, i) => ({ ...c, id: id(), r: R_CIBLE, vx: 0, vy: 0, masse: 2.2, photo: photos.length ? photos[i % photos.length] : null })),
    pierres: [],
    poufs: [],
    eclats: [],
    file,
    reste: file.length,
    temps: 0,
  };
}

/** Pierre prête dans la fronde (type), ou null. */
export const pierreSuivante = (monde) => (monde.file && monde.file.length ? monde.file[0] : null);

/** Vitesse de lancement d'après le tirage (vecteur du centre de la fronde vers le doigt) et la pierre. */
export function lancement(dx, dy, type = "galet") {
  const d = Math.hypot(dx, dy);
  const k = d > TIRAGE_MAX ? TIRAGE_MAX / d : 1;
  const p = PUISSANCE * (TYPES_PIERRE[type] || TYPES_PIERRE.galet).puissance;
  return { vx: -dx * k * p, vy: -dy * k * p };
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
  const type = (monde.file && monde.file.shift()) || "galet";
  const t = TYPES_PIERRE[type] || TYPES_PIERRE.galet;
  const v = lancement(dx, dy, type);
  const n = id();
  monde.pierres.push({ id: n, pierre: true, type, x: FRONDE.x, y: FRONDE.y, r: t.r, masse: t.masse, ...v, vie: 0, angle: 0, forme: formePierre(type, n) });
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
          if (o.r && !o.pierre && v > SEUIL_CIBLE + 60) o.mort = true;
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
          const t = c.pierre ? TYPES_PIERRE[c.type] || TYPES_PIERRE.galet : null;
          const v = choc(c, b, k.nx, k.ny, k.p, t ? t.rebond : 0.05);
          if (v > 80) ev.chocs += 1;
          // Dégâts selon la pierre (un silex perce le bois, un rocher casse la pierre) et sa masse.
          if (v > SEUIL_BOIS) b.pv -= (v - SEUIL_BOIS) * (t ? t[b.materiau === "bois" ? "bois" : "pierre"] * Math.sqrt(t.masse / 6) : 0.2);
          if (!c.pierre && v > SEUIL_CIBLE) c.mort = true;
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
          if (v > SEUIL_CIBLE * 0.8) { if (!a.pierre) a.mort = true; if (!b.pierre) b.mort = true; }
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
  for (const p of monde.pierres) { p.vie += dt; p.angle = (p.angle || 0) + (p.vx * dt) / p.r; }
  monde.pierres = monde.pierres.filter((p) => p.x < LARGEUR + 60 && p.x > -60 && p.vie < 9);
  monde.poufs = monde.poufs.filter((p) => (p.t += dt) < 0.7);
  monde.eclats = monde.eclats.filter((p) => (p.t += dt) < 0.5);
  monde.temps += dt;
  return ev;
}

/**
 * La fronde est-elle de nouveau prête ? (1.3.34) La pierre suivante n'attend plus que tout le décor soit
 * immobile (les grandes tours tremblaient longtemps) : seulement que la pierre lancée ait fini sa course.
 */
export function pretATirer(monde, depuis) {
  if (depuis < 0.7) return false;
  const lancee = monde.pierres[monde.pierres.length - 1];
  const finie = !lancee || Math.hypot(lancee.vx, lancee.vy) < 40 || lancee.vie > 2.2;
  return finie || depuis > 2.4;
}

/** Tout est presque immobile ? (fin d'un tir) */
export function auRepos(monde) {
  const v = (o) => Math.hypot(o.vx, o.vy);
  return [...monde.blocs, ...monde.cibles].every((o) => v(o) < 12) && monde.pierres.every((p) => v(p) < 15 || p.vie > 6);
}

/** Étoiles : selon les pierres qui restent après la victoire. */
export const etoilesFronde = (reste) => (reste >= 2 ? 3 : reste === 1 ? 2 : 1);

/** Points d'un niveau réussi (même calcul que le serveur). */
export const pointsFronde = (n, etoiles) => (n >= 1 && n <= 60 && etoiles >= 1 && etoiles <= 3 ? (5 + n) * etoiles : 0);
