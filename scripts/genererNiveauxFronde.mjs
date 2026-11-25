// Chay Fronde (1.3.34) : génère les niveaux 10 à 60 et les vérifie, puis écrit src/data/niveauxFronde.js.
// Usage : node scripts/genererNiveauxFronde.mjs [premier=10] [dernier=60] [sortie.json]
// Chaque niveau : tient debout tout seul, et un tireur « glouton » (qui essaie 51 tirs et garde le meilleur à
// chaque pierre) le gagne avec la suite de pierres imposée. Le niveau donne ses pierres + 1 de réserve.
// La difficulté monte : plus de tours, d'étages, de pierre, de murs et de cibles cachées ; il faut plus de tirs.
import fs from "node:fs";
import { SOL, avancer, creerMonde, tirer } from "../src/lib/fronde.js";

const [premier = 10, dernier = 60, sortie] = process.argv.slice(2).map((v, i) => (i < 2 ? Number(v) : v));

function rng(graine) {
  let s = graine >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const choisir = (a, r) => a[Math.floor(r() * a.length)];

function genere(numero, essai) {
  const r = rng(numero * 7919 + essai * 104729);
  const d = (numero - 10) / 50; // 0 → 1
  const nTours = Math.min(4, 2 + (r() < 0.35 + d * 0.45 ? 1 : 0) + (d > 0.45 && r() < 0.45 ? 1 : 0));
  const tours = [];
  const murs = [];
  let x = 400 + r() * 40;
  const avecMur = r() < 0.3 + d * 0.5;
  if (avecMur) x += 30;
  for (let t = 0; t < nTours; t += 1) {
    const largeur = Math.round(70 + r() * 40);
    const etages = Math.min(6, 2 + Math.floor(r() * (2 + d * 3.2)));
    const he = etages >= 5 ? 52 : etages === 4 ? 60 : 70;
    const cx = Math.round(x + largeur / 2);
    if (cx + largeur / 2 > 735) break;
    const materiaux = Array.from({ length: etages }, () => (r() < 0.22 + d * 0.55 ? "pierre" : "bois"));
    const nC = Math.max(1, Math.min(etages + 1, 1 + Math.floor(r() * (1.5 + d * 2.5))));
    const places = new Set();
    while (places.size < nC) places.add(1 + Math.floor(r() * (etages + 1)));
    tours.push([cx, etages, largeur, [...places].sort((a, b) => a - b), materiaux, he]);
    x = cx + largeur / 2 + 14 + r() * 30;
  }
  if (avecMur && tours.length) {
    const premiere = tours[0];
    murs.push([Math.round(premiere[0] - premiere[2] / 2 - 26), Math.round(90 + r() * (60 + d * 130)), "pierre"]);
  }
  const poids = [["galet", 0.32], ["caillou", 0.18], ["rocher", 0.22 + d * 0.1], ["silex", 0.28]];
  const total = poids.reduce((s, p) => s + p[1], 0);
  const pierres = Array.from({ length: 9 }, () => {
    let v = r() * total;
    for (const [nom, p] of poids) { v -= p; if (v <= 0) return nom; }
    return "galet";
  });
  return { tours, murs, pierres };
}

function tientDebout(niv) {
  const m = creerMonde(0, [], niv);
  const top = Math.min(...m.blocs.map((b) => b.y - b.h / 2), ...m.cibles.map((c) => c.y - c.r));
  if (top < 125) return false;
  const nc = m.cibles.length;
  const nb = m.blocs.length;
  for (let i = 0; i < 240; i += 1) avancer(m, 1 / 60);
  return m.cibles.length === nc && m.blocs.length === nb;
}

const TIRS = [];
for (let ang = -10; ang <= 70; ang += 5) for (const p of [68, 84, 95]) TIRS.push([ang, p]);

function resoudre(niv, max = 8) {
  let m = creerMonde(0, [], { ...niv, pierres: niv.pierres.slice(0, max) });
  for (let i = 0; i < 60; i += 1) avancer(m, 1 / 60);
  let tirs = 0;
  while (m.cibles.length && m.reste > 0) {
    let meilleur = null;
    for (const [ang, p] of TIRS) {
      const c = structuredClone(m);
      const a = (ang * Math.PI) / 180;
      tirer(c, -Math.cos(a) * p, Math.sin(a) * p);
      for (let i = 0; i < 240; i += 1) avancer(c, 1 / 60);
      const score = -c.cibles.length * 100 - c.blocs.length;
      if (!meilleur || score > meilleur.score) meilleur = { score, c };
    }
    m = meilleur.c;
    tirs += 1;
  }
  return m.cibles.length ? null : tirs;
}

const niveaux = [];
for (let numero = premier; numero <= dernier; numero += 1) {
  const d = (numero - 10) / 50;
  const minTirs = 3 + Math.round(d * 2);
  let retenu = null;
  for (let essai = 0; essai < 40 && !retenu; essai += 1) {
    const niv = genere(numero, essai);
    if (!niv.tours.length || !tientDebout(niv)) continue;
    const g = resoudre(niv);
    if (g === null || g < minTirs) continue;
    retenu = { tours: niv.tours, murs: niv.murs, pierres: niv.pierres.slice(0, g + 1), tirs: g };
    console.error(`niveau ${numero} : ${g} tirs (essai ${essai + 1}), ${niv.tours.length} tours, ${niv.murs.length} mur(s)`);
  }
  if (!retenu) { console.error(`niveau ${numero} : AUCUN`); process.exitCode = 1; continue; }
  niveaux.push(retenu);
}
void SOL;
if (sortie) fs.writeFileSync(sortie, JSON.stringify(niveaux));
else console.log(JSON.stringify(niveaux));
