#!/usr/bin/env node
// Références croisées (1.3.26) : public/data/references/<livre>.json à partir de cross_references.txt
// d'OpenBible.info (CC BY, https://www.openbible.info/labs/cross-references/).
// Usage : node scripts/build-references.mjs <chemin de cross_references.txt>
// Format de sortie, un fichier par livre (1 = Genèse … 66 = Apocalypse) :
//   { "3.16": "45.5.8|62.4.9-62.4.10|…" }  clé « chapitre.verset », références « livre.chapitre.verset »
//   (ou « début-fin » pour un passage), triées par votes décroissants. Seules les références approuvées
//   (votes > 0) sont gardées, 40 au plus par verset.
import fs from 'node:fs';
import path from 'node:path';
import { OSIS_LIVRES } from '../src/lib/referencesCroisees.js';

const MAX = 40;
const source = process.argv[2];
if (!source) { console.error('Usage : node scripts/build-references.mjs <cross_references.txt>'); process.exit(1); }
const sortie = path.resolve('public/data/references');
const rang = new Map(OSIS_LIVRES.map((o, i) => [o, i + 1]));

const ref = (s) => {
  const [l, c, v] = s.split('.');
  const b = rang.get(l);
  return b && Number(c) > 0 && Number(v) > 0 ? `${b}.${Number(c)}.${Number(v)}` : null;
};

const parLivre = new Map();
let gardees = 0;
for (const ligne of fs.readFileSync(source, 'utf8').split(/\r?\n/).slice(1)) {
  const [de, vers, votes] = ligne.split('\t');
  if (!de || !vers || !(Number(votes) > 0)) continue;
  const depart = ref(de);
  const [a, z] = vers.split('-');
  const debut = ref(a);
  const fin = z ? ref(z) : null;
  if (!depart || !debut || (z && !fin)) continue;
  const [b, c, v] = depart.split('.');
  if (!parLivre.has(b)) parLivre.set(b, new Map());
  const livre = parLivre.get(b);
  const cle = `${c}.${v}`;
  if (!livre.has(cle)) livre.set(cle, []);
  livre.get(cle).push({ r: fin && fin !== debut ? `${debut}-${fin}` : debut, votes: Number(votes) });
}

fs.mkdirSync(sortie, { recursive: true });
for (const [b, livre] of parLivre) {
  const obj = {};
  for (const [cle, liste] of livre) {
    const vues = new Set();
    obj[cle] = liste.sort((x, y) => y.votes - x.votes)
      .filter((x) => !vues.has(x.r) && vues.add(x.r))
      .slice(0, MAX).map((x) => x.r).join('|');
    gardees += obj[cle].split('|').length;
  }
  fs.writeFileSync(path.join(sortie, `${b}.json`), JSON.stringify(obj));
}
console.log(`${parLivre.size} livres, ${gardees} références écrites dans ${sortie}`);
