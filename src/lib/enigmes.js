// Énigmes (1.3.32, Chay Game) : 8 énigmes de 3 niveaux chacune, façon Duolingo. Rien n'est expliqué d'avance :
// la méthode se découvre, ou se demande par indices (chaque indice coûte une étoile). Chaque niveau cache un mot
// biblique (niveau 1 court, niveau 2 moyen, niveau 3 une petite phrase) ; les 3 niveaux réussis ouvrent
// l'énigme suivante. Règles pures (testées par enigmes.test.js) : codages, tables d'aide, réponse juste.

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const rang = (l) => ALPHABET.indexOf(l);

/** Majuscules sans accents, espaces simples (« Dieu  est amour ! » -> « DIEU EST AMOUR »). */
export function normaliser(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}
/** La réponse est juste (majuscules, accents, espaces et ponctuation ignorés). */
export const reponseJuste = (saisie, attendu) => normaliser(saisie).replace(/ /g, "") === normaliser(attendu).replace(/ /g, "");

const mots = (t) => normaliser(t).split(" ");

// ── 1. À voter : A vaut T ────────────────────────────────────────────────────
export const DECALAGE = 19; // A -> T
export const avoter = (t) => mots(t).map((m) => [...m].map((l) => ALPHABET[(rang(l) + DECALAGE) % 26]).join("")).join(" ");
export const tableAvoter = () => [...ALPHABET].map((l) => [l, ALPHABET[(rang(l) + DECALAGE) % 26]]);

// ── 2. Monte et descends : Morse, ↑ = tiret, ↓ = point ──────────────────────
export const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
};
export const fleches = (code) => [...code].map((s) => (s === "-" ? "↑" : "↓")).join("");
/** [[« ↓↑ », …] par mot]. */
export const morse = (t) => mots(t).map((m) => [...m].map((l) => fleches(MORSE[l])));

// ── 3. Dumbphone : 5¹ = J ────────────────────────────────────────────────────
export const TOUCHES = { 2: "ABC", 3: "DEF", 4: "GHI", 5: "JKL", 6: "MNO", 7: "PQRS", 8: "TUV", 9: "WXYZ" };
const touche = (l) => {
  for (const [chiffre, lettres] of Object.entries(TOUCHES)) {
    const i = lettres.indexOf(l);
    if (i >= 0) return { chiffre, fois: i + 1 };
  }
  return null;
};
/** [[{ chiffre, fois }, …] par mot]. */
export const dumbphone = (t) => mots(t).map((m) => [...m].map(touche));

// ── 4. Allons en Égypte : un hiéroglyphe par lettre, table partielle ─────────
/** Hiéroglyphe (identifiant de dessin) de chaque lettre : un mélange fixe, toujours le même. */
export const GLYPHE = Object.fromEntries([...ALPHABET].map((l, i) => [l, (i * 7 + 3) % 26]));
/**
 * Lettres montrées dans la table d'un niveau : celles des mots des niveaux d'avant (déjà trouvés), et celles du
 * mot à trouver sauf `cachees` d'entre elles (à deviner avec l'indice).
 */
export function lettresConnues(reponses, niveau, cachees) {
  const avant = new Set(reponses.slice(0, niveau).flatMap((r) => [...normaliser(r).replace(/ /g, "")]));
  const ici = [...new Set(normaliser(reponses[niveau]).replace(/ /g, ""))];
  const nouvelles = ici.filter((l) => !avant.has(l));
  const aCacher = new Set(nouvelles.slice(-Math.min(cachees, Math.max(0, nouvelles.length - 1))));
  return new Set([...avant, ...ici.filter((l) => !aCacher.has(l))]);
}

// ── 5. Le miroir ─────────────────────────────────────────────────────────────
export const envers = (t) => [...normaliser(t)].reverse().join("");

// ── 6. Les chiffres : A = 1 ──────────────────────────────────────────────────
export const valeur = (l) => rang(l) + 1;
/** Niveau 1 : « 1 · 13 · … » ; niveaux 2 et 3 : un calcul par lettre (toujours le même pour une lettre donnée). */
export function chiffres(t, avecCalculs) {
  return mots(t).map((m) => [...m].map((l, k) => {
    const v = valeur(l);
    if (!avecCalculs) return String(v);
    const mode = (v + k) % 3;
    if (mode === 0 && v % 2 === 0) return `${v / 2}×2`;
    if (mode === 1 && v > 3) return `${v - 3}+3`;
    return `${v + 2}−2`;
  }));
}
/** Valeur d'un calcul « 5×2 », « 7+3 », « 12−2 » ou d'un nombre. */
export function calculer(expr) {
  const m = String(expr).match(/^(\d+)([×+−])(\d+)$/);
  if (!m) return Number(expr);
  const a = Number(m[1]);
  const b = Number(m[3]);
  return m[2] === "×" ? a * b : m[2] === "+" ? a + b : a - b;
}

// ── 8. Le clavier décalé : chaque lettre devient sa voisine de droite (AZERTY) ─
export const AZERTY = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];
const droite = (l) => {
  for (const r of AZERTY) {
    const i = r.indexOf(l);
    if (i >= 0) return r[(i + 1) % r.length];
  }
  return l;
};
export const clavierDecale = (t) => mots(t).map((m) => [...m].map(droite).join("")).join(" ");

// ── Les 8 énigmes ────────────────────────────────────────────────────────────
export const ENIGMES = [
  {
    id: "avoter", titre: "À voter", icone: "🔤",
    indices: ["A vaut T.", "B vaut U, C vaut V… : chaque lettre a avancé de 19 places dans l'alphabet.", "table"],
    niveaux: [{ reponse: "FOI" }, { reponse: "GRACE" }, { reponse: "DIEU NOUS AIME" }],
  },
  {
    id: "morse", titre: "Monte et descends", icone: "↕️",
    indices: ["Ce ne sont pas des flèches : ce sont des signaux.", "↑ est un trait, ↓ est un point : c'est du Morse. Chaque groupe est une lettre.", "table"],
    niveaux: [{ reponse: "PAIX" }, { reponse: "LUMIERE" }, { reponse: "JESUS SAUVE" }],
  },
  {
    id: "dumbphone", titre: "Dumbphone", icone: "📱",
    indices: ["Pense aux vieux téléphones à touches.", "Le grand chiffre est la touche, le petit le nombre d'appuis : 5¹ = J, 5² = K.", "table"],
    niveaux: [{ reponse: "JOIE" }, { reponse: "BERGER" }, { reponse: "DIEU T AIME" }],
  },
  {
    id: "egypte", titre: "Allons en Égypte", icone: "𓂀",
    indices: ["definition", "Chaque dessin est une lettre. Un même dessin, c'est toujours la même lettre.", "table"],
    niveaux: [
      { reponse: "ARCHE", indice: "Le bateau de Noé", cachees: 1 },
      { reponse: "MOISE", indice: "Sauvé des eaux", cachees: 2 },
      { reponse: "PAIX SUR LA TERRE", indice: "Le chant des anges (Luc 2:14)", cachees: 2 },
    ],
  },
  {
    id: "miroir", titre: "Le miroir", icone: "🪞",
    indices: ["Regarde-le autrement.", "Un miroir… à l'envers… ou la tête en bas !"],
    niveaux: [{ reponse: "ESPOIR", effet: "miroir" }, { reponse: "PRIERE", effet: "envers" }, { reponse: "DIEU EST FIDELE", effet: "renverse" }],
  },
  {
    id: "chiffres", titre: "Les chiffres", icone: "🔢",
    indices: ["Chaque lettre a un rang.", "A = 1, B = 2, C = 3… Les calculs donnent un rang.", "table"],
    niveaux: [{ reponse: "AMOUR" }, { reponse: "SALUT", calculs: true }, { reponse: "IL EST VIVANT", calculs: true }],
  },
  {
    id: "reference", titre: "Référence secrète", icone: "📖",
    indices: ["Compte les mots séparés par des espaces (« qu'il » compte pour un seul mot).", "initiales"],
    niveaux: [
      { reponse: "CHEMIN", refs: [["Jean 14:6", 7]] },
      { reponse: "DIEU AIME", refs: [["Jean 3:16", 2], ["Jean 3:16", 5]] },
      { reponse: "DIEU EST AMOUR", refs: [["Jean 1:1", 16], ["Psaumes 23:1", 5], ["1 Jean 4:16", 19]] },
    ],
  },
  {
    id: "clavier", titre: "Le clavier décalé", icone: "⌨️",
    indices: ["Regarde bien ton clavier.", "Chaque lettre a glissé d'une touche vers la droite.", "table"],
    niveaux: [{ reponse: "GLOIRE" }, { reponse: "SAGESSE" }, { reponse: "DIEU EST AVEC TOI" }],
  },
];

/** Énigmes à venir : montrées en gris (« Bientôt »). */
export const A_VENIR = 4;

// ── Progrès, étoiles, points ─────────────────────────────────────────────────
/**
 * Étoiles d'un niveau réussi (1.3.32) : les cœurs restants, moins un par indice demandé (1 au moins).
 * Rien n'est donné d'avance : la méthode se découvre, ou s'achète avec des indices.
 */
export const etoilesNiveau = (coeurs, indices) => Math.max(1, Math.min(coeurs, 3 - indices));
/** Indice « initiales » : la première lettre de chaque mot de la réponse (« D… E… A… »). */
export const initiales = (reponse) => normaliser(reponse).split(" ").map((m) => `${m[0]}…`).join(" ");
export const cle = (e, n) => `${e}-${n}`;
/** Le niveau `n` (0..2) de l'énigme `e` (0..7) est-il ouvert ? */
export function ouvert(etoiles, e, n) {
  if (n > 0) return Boolean(etoiles?.[cle(e, n - 1)]);
  if (e === 0) return true;
  return [0, 1, 2].every((k) => etoiles?.[cle(e - 1, k)]);
}
/** Énigme entièrement réussie ? */
export const enigmeFinie = (etoiles, e) => [0, 1, 2].every((k) => etoiles?.[cle(e, k)]);
/** Points d'un niveau réussi (même calcul que le serveur) : 10 + 5 × étoiles + 5 × (niveau − 1). */
export function pointsNiveau(enigme, niveau, nbEtoiles) {
  if (enigme < 1 || enigme > ENIGMES.length || niveau < 1 || niveau > 3 || nbEtoiles < 1 || nbEtoiles > 3) return 0;
  return 10 + 5 * nbEtoiles + 5 * (niveau - 1);
}
