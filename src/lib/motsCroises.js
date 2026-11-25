// Mots croisés bibliques (1.3.31) : règles pures (testées par motsCroises.test.js).
//  - mots : { mot (MAJUSCULES sans accents), definition, reference } (base de départ : src/data/motsCroises.json,
//    puis la liste de l'admin, collection MotCroise) ;
//  - genererGrille : une grille toujours nouvelle (7 × 7, 9 × 9 ou 11 × 11), mots qui se croisent comme dans un
//    vrai journal : jamais deux lettres côte à côte qui ne forment pas un mot ;
//  - navigation : case suivante, mot d'une case, mot suivant ;
//  - points : selon la taille, les indices et le temps (même calcul que le serveur, pb_hooks/lib/scores.js).

export const TAILLES = [
  { id: 7, label: "Facile", nbMots: 6, base: 30, rapide: 120 },
  { id: 9, label: "Moyen", nbMots: 10, base: 60, rapide: 300 },
  { id: 11, label: "Difficile", nbMots: 15, base: 100, rapide: 540 },
];

/** Majuscules sans accents ni espaces (« Moïse » -> « MOISE »). */
export function normaliserMot(m) {
  return String(m || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
}

function melanger(liste, hasard) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

const vide = (taille) => Array.from({ length: taille }, () => Array(taille).fill(null));
const dans = (taille, r, c) => r >= 0 && c >= 0 && r < taille && c < taille;

/** Nombre de croisements si le mot est posé là, ou -1 si c'est interdit. */
function essai(g, taille, mot, r, c, dir) {
  const dr = dir === "v" ? 1 : 0;
  const dc = dir === "h" ? 1 : 0;
  const fr = r + dr * (mot.length - 1);
  const fc = c + dc * (mot.length - 1);
  if (!dans(taille, r, c) || !dans(taille, fr, fc)) return -1;
  if (dans(taille, r - dr, c - dc) && g[r - dr][c - dc]) return -1; // case avant le mot
  if (dans(taille, fr + dr, fc + dc) && g[fr + dr][fc + dc]) return -1; // case après le mot
  let croisements = 0;
  for (let k = 0; k < mot.length; k += 1) {
    const rr = r + dr * k;
    const cc = c + dc * k;
    const deja = g[rr][cc];
    if (deja) {
      if (deja !== mot[k]) return -1;
      croisements += 1;
      continue;
    }
    // Nouvelle lettre : rien à côté dans l'autre sens (sinon un faux mot apparaîtrait).
    const a1 = dans(taille, rr - dc, cc - dr) && g[rr - dc][cc - dr];
    const a2 = dans(taille, rr + dc, cc + dr) && g[rr + dc][cc + dr];
    if (a1 || a2) return -1;
  }
  return croisements === mot.length ? -1 : croisements; // jamais un mot entièrement recouvert
}

function poser(g, mot, r, c, dir) {
  for (let k = 0; k < mot.length; k += 1) g[r + (dir === "v" ? k : 0)][c + (dir === "h" ? k : 0)] = mot[k];
}

/** Une tentative : { g, places: [{ mot, r, c, dir, source }] }. */
function tentative(candidats, taille, nbVoulu, hasard) {
  const g = vide(taille);
  const places = [];
  const liste = melanger(candidats, hasard);
  const premier = liste.find((m) => m.mot.length >= Math.min(5, taille - 2) && m.mot.length <= taille);
  if (!premier) return { g, places };
  const c0 = Math.floor(hasard() * (taille - premier.mot.length + 1));
  const r0 = Math.floor(taille / 2) - 1 + Math.floor(hasard() * 3);
  poser(g, premier.mot, r0, c0, "h");
  places.push({ mot: premier.mot, r: r0, c: c0, dir: "h", source: premier });
  const pris = new Set([premier.mot]);
  for (let tour = 0; tour < 3 && places.length < nbVoulu; tour += 1) {
    for (const m of liste) {
      if (places.length >= nbVoulu) break;
      if (pris.has(m.mot) || m.mot.length > taille) continue;
      let meilleurs = [];
      let max = 0;
      for (let r = 0; r < taille; r += 1) {
        for (let c = 0; c < taille; c += 1) {
          if (!g[r][c]) continue;
          for (let k = 0; k < m.mot.length; k += 1) {
            if (m.mot[k] !== g[r][c]) continue;
            for (const dir of ["h", "v"]) {
              const rr = dir === "v" ? r - k : r;
              const cc = dir === "h" ? c - k : c;
              const n = essai(g, taille, m.mot, rr, cc, dir);
              if (n > max) { max = n; meilleurs = [{ r: rr, c: cc, dir }]; } else if (n > 0 && n === max) meilleurs.push({ r: rr, c: cc, dir });
            }
          }
        }
      }
      if (!meilleurs.length) continue;
      const p = meilleurs[Math.floor(hasard() * meilleurs.length)];
      poser(g, m.mot, p.r, p.c, p.dir);
      places.push({ mot: m.mot, r: p.r, c: p.c, dir: p.dir, source: m });
      pris.add(m.mot);
    }
  }
  return { g, places };
}

/**
 * Grille de `taille` × `taille` avec environ `nbMots` mots, tirés de `mots`.
 * Renvoie { taille, cases (lettre ou null), mots: [{ num, dir, r, c, mot, longueur, definition, reference }] }.
 */
export function genererGrille(mots, taille, nbMots, hasard = Math.random, essais = 30) {
  const candidats = [];
  const vus = new Set();
  for (const m of mots || []) {
    const mot = normaliserMot(m.mot);
    if (mot.length < 3 || mot.length > taille || vus.has(mot) || !String(m.definition || "").trim()) continue;
    vus.add(mot);
    candidats.push({ ...m, mot });
  }
  let meilleure = null;
  for (let i = 0; i < essais; i += 1) {
    const t = tentative(candidats, taille, nbMots, hasard);
    const lettres = t.g.flat().filter(Boolean).length;
    if (!meilleure || t.places.length > meilleure.places.length || (t.places.length === meilleure.places.length && lettres > meilleure.lettres)) {
      meilleure = { ...t, lettres };
    }
    if (meilleure.places.length >= nbMots) break;
  }
  return numeroter(meilleure?.g || vide(taille), meilleure?.places || [], taille);
}

/** Numéros des définitions (de gauche à droite, de haut en bas, comme dans un journal). */
function numeroter(g, places, taille) {
  const debut = new Map();
  let n = 0;
  for (let r = 0; r < taille; r += 1) {
    for (let c = 0; c < taille; c += 1) {
      if (places.some((p) => p.r === r && p.c === c)) { n += 1; debut.set(`${r}-${c}`, n); }
    }
  }
  const mots = places
    .map((p) => ({
      num: debut.get(`${p.r}-${p.c}`), dir: p.dir, r: p.r, c: p.c, mot: p.mot, longueur: p.mot.length,
      definition: String(p.source.definition || "").trim(), reference: String(p.source.reference || "").trim(),
    }))
    .sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === "h" ? -1 : 1));
  return { taille, cases: g, mots };
}

/** Cases d'un mot : ["r-c", …]. */
export const casesDuMot = (m) => Array.from({ length: m.longueur }, (_, k) => `${m.r + (m.dir === "v" ? k : 0)}-${m.c + (m.dir === "h" ? k : 0)}`);

/** Mot qui passe par la case dans le sens voulu (sinon dans l'autre sens), ou null. */
export function motDeCase(grille, r, c, dir) {
  const cle = `${r}-${c}`;
  return grille.mots.find((m) => m.dir === dir && casesDuMot(m).includes(cle))
    || grille.mots.find((m) => casesDuMot(m).includes(cle))
    || null;
}

/** Le mot est-il bien rempli ? */
export const motJuste = (m, saisies) => casesDuMot(m).every((k, i) => saisies[k] === m.mot[i]);
/** Le mot est-il rempli (juste ou non) ? */
export const motRempli = (m, saisies) => casesDuMot(m).every((k) => saisies[k]);

/** Grille finie et juste. */
export const grilleJuste = (grille, saisies) => grille.mots.every((m) => motJuste(m, saisies));

/** Cases fausses (remplies avec une mauvaise lettre). */
export function casesFausses(grille, saisies) {
  const out = new Set();
  grille.cases.forEach((ligne, r) => ligne.forEach((l, c) => {
    const k = `${r}-${c}`;
    if (l && saisies[k] && saisies[k] !== l) out.add(k);
  }));
  return out;
}

/** Après une lettre : case suivante du mot (la prochaine vide, sinon la suivante), ou null en fin de mot. */
export function caseSuivante(m, cle, saisies) {
  const cases = casesDuMot(m);
  const i = cases.indexOf(cle);
  for (let k = i + 1; k < cases.length; k += 1) if (!saisies[cases[k]]) return cases[k];
  return i + 1 < cases.length ? cases[i + 1] : null;
}

/** Mot suivant pas encore juste (dans l'ordre des définitions), ou null si tout est juste. */
export function motSuivant(grille, actuel, saisies, pas = 1) {
  const liste = grille.mots;
  const i = Math.max(0, liste.indexOf(actuel));
  for (let k = 1; k <= liste.length; k += 1) {
    const m = liste[(i + pas * k + liste.length * k) % liste.length];
    if (!motJuste(m, saisies)) return m;
  }
  return null;
}

/** Points d'une grille finie (même calcul que le serveur). */
export function pointsGrille(taille, indices, secondes) {
  const t = TAILLES.find((x) => x.id === Number(taille));
  if (!t || secondes < 15) return 0;
  const bonus = secondes <= t.rapide ? Math.round(t.base * 0.2) : 0;
  return Math.max(5, t.base + bonus - 10 * Math.max(0, Math.floor(indices)));
}
