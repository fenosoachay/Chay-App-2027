// « Libère la voiture » (1.3.30) : grille de 6 × 6, la voiture rouge (le premier véhicule) doit sortir par
// la droite de la 3e ligne. Chaque véhicule glisse seulement dans son sens (horizontal ou vertical).
// Règles pures (testées par voiture.test.js) ; niveaux : src/data/niveauxVoiture.json (30 niveaux, du plus
// facile au plus difficile, chacun vérifié : `coups` = nombre minimal de déplacements).

export const TAILLE = 6;
export const LIGNE_SORTIE = 2;

/** Niveau brut { coups, v: [[ligne, colonne, longueur, horizontal(1|0)]] } -> véhicules. */
export function lireNiveau(brut) {
  return (brut?.v || []).map(([r, c, l, h], i) => ({ id: i, r, c, l, h: Boolean(h), rouge: i === 0 }));
}

/** Grille : index de case -> id du véhicule (ou -1). */
export function grille(vehicules) {
  const g = Array(TAILLE * TAILLE).fill(-1);
  for (const v of vehicules) {
    for (let k = 0; k < v.l; k += 1) {
      const r = v.r + (v.h ? 0 : k);
      const c = v.c + (v.h ? k : 0);
      g[r * TAILLE + c] = v.id;
    }
  }
  return g;
}

/** Jusqu'où le véhicule peut glisser : { min, max } en cases (négatif = gauche / haut). */
export function course(vehicules, id) {
  const v = vehicules.find((x) => x.id === id);
  if (!v) return { min: 0, max: 0 };
  const g = grille(vehicules);
  const libre = (r, c) => r >= 0 && r < TAILLE && c >= 0 && c < TAILLE && g[r * TAILLE + c] === -1;
  let min = 0;
  let max = 0;
  if (v.h) {
    while (libre(v.r, v.c + min - 1)) min -= 1;
    while (libre(v.r, v.c + v.l + max)) max += 1;
  } else {
    while (libre(v.r + min - 1, v.c)) min -= 1;
    while (libre(v.r + v.l + max, v.c)) max += 1;
  }
  return { min, max };
}

/** Déplace le véhicule de `pas` cases (borné à sa course). Renvoie la nouvelle liste (ou la même si rien). */
export function deplacer(vehicules, id, pas) {
  const { min, max } = course(vehicules, id);
  const p = Math.max(min, Math.min(max, Math.round(pas)));
  if (!p) return vehicules;
  return vehicules.map((v) => (v.id !== id ? v : v.h ? { ...v, c: v.c + p } : { ...v, r: v.r + p }));
}

/** Gagné : la voiture rouge touche le bord droit (la sortie). */
export const gagne = (vehicules) => {
  const rouge = vehicules.find((v) => v.rouge);
  return Boolean(rouge && rouge.c + rouge.l === TAILLE);
};

/** Étoiles : 3 si le minimum est atteint, 2 jusqu'à 1,5 × le minimum + 2, sinon 1. */
export function etoiles(coupsJoues, minimum) {
  if (coupsJoues <= minimum) return 3;
  if (coupsJoues <= Math.ceil(minimum * 1.5) + 2) return 2;
  return 1;
}

/** Nombre minimal de déplacements (recherche en largeur) ; -1 si impossible. Pour vérifier les niveaux. */
export function coupsMinimum(depart, limite = 300000) {
  const cle = (vs) => vs.map((v) => (v.h ? v.c : v.r)).join(",");
  const vus = new Set([cle(depart)]);
  let file = [depart];
  for (let prof = 0; file.length; prof += 1) {
    const suivants = [];
    for (const vs of file) {
      if (gagne(vs)) return prof;
      for (const v of vs) {
        const { min, max } = course(vs, v.id);
        for (let p = min; p <= max; p += 1) {
          if (!p) continue;
          const n = deplacer(vs, v.id, p);
          const k = cle(n);
          if (!vus.has(k)) { vus.add(k); suivants.push(n); }
        }
      }
      if (vus.size > limite) return -1;
    }
    file = suivants;
  }
  return -1;
}

/** Progrès d'un enfant : { niveau: dernier niveau ouvert (1..30), etoiles: { [n]: 1..3 } }. */
export function progresApres(progres, niveau, nbEtoiles, total) {
  const p = { niveau: 1, etoiles: {}, ...(progres || {}) };
  const etoilesNiveau = Math.max(p.etoiles?.[niveau] || 0, nbEtoiles);
  return { niveau: Math.min(total, Math.max(p.niveau, niveau + 1)), etoiles: { ...p.etoiles, [niveau]: etoilesNiveau } };
}
