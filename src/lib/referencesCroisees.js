// Références croisées (1.3.26) : dans le lecteur de la Bible, on touche un verset puis « Références ».
// Données : OpenBible.info (CC BY), préparées par scripts/build-references.mjs dans public/data/references/
// (un fichier par livre, chargé seulement quand on en a besoin, gardé en mémoire ; inclus dans l'APK : marche
// hors ligne). Les livres sont repérés par leur rang canonique (1 = Genèse … 66 = Apocalypse), le même dans
// les deux Bibles de l'app (Louis Segond et Baiboly).

/** Livres d'OpenBible.info (OSIS), dans l'ordre canonique. */
export const OSIS_LIVRES = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr",
  "Ezra", "Neh", "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel",
  "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
  "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess",
  "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];

export const SOURCE_REFERENCES = "OpenBible.info (CC BY)";

/** « 45.5.8 » ou « 62.4.9-62.4.10 » -> { b, c, v, b2, c2, v2 } (fin = début pour un seul verset), ou null. */
export function lireReference(s) {
  const [a, z] = String(s || "").split("-");
  const p = (x) => {
    const n = String(x || "").split(".").map(Number);
    return n.length === 3 && n.every((k) => Number.isInteger(k) && k > 0) && n[0] <= 66 ? n : null;
  };
  const d = p(a);
  if (!d) return null;
  const f = z ? p(z) : d;
  if (!f) return null;
  return { b: d[0], c: d[1], v: d[2], b2: f[0], c2: f[1], v2: f[2] };
}

/** Références d'un verset dans le fichier d'un livre déjà chargé. */
export function referencesDe(donneesLivre, chapitre, verset) {
  const brut = donneesLivre?.[`${chapitre}.${verset}`];
  return brut ? brut.split("|").map(lireReference).filter(Boolean) : [];
}

/** Références de plusieurs versets sélectionnés : réunies, sans doublon, ni les versets sélectionnés eux-mêmes. */
export function referencesDeVersets(donneesLivre, rangLivre, chapitre, versets) {
  const vus = new Set();
  const choisis = new Set((versets || []).map((v) => `${rangLivre}.${chapitre}.${v}`));
  const out = [];
  for (const v of versets || []) {
    for (const r of referencesDe(donneesLivre, chapitre, v)) {
      const cle = `${r.b}.${r.c}.${r.v}-${r.b2}.${r.c2}.${r.v2}`;
      if (vus.has(cle) || choisis.has(`${r.b}.${r.c}.${r.v}`)) continue;
      vus.add(cle);
      out.push(r);
    }
  }
  return out;
}

/** « Romains 5:8 », « 1 Jean 4:9-10 », « Matthieu 5:3–6:2 ». `nomLivre(rang)` donne le nom dans la langue lue. */
export function libelleReference(r, nomLivre) {
  const debut = `${nomLivre(r.b)} ${r.c}:${r.v}`;
  if (r.b === r.b2 && r.c === r.c2 && r.v === r.v2) return debut;
  if (r.b === r.b2 && r.c === r.c2) return `${debut}-${r.v2}`;
  if (r.b === r.b2) return `${debut}–${r.c2}:${r.v2}`;
  return `${debut} – ${nomLivre(r.b2)} ${r.c2}:${r.v2}`;
}

/** Texte d'un passage du même chapitre, à partir des versets du chapitre [{ number, text }] ; « » si absent. */
export function textePassage(versetsChapitre, r) {
  const fin = r.b === r.b2 && r.c === r.c2 ? r.v2 : r.v;
  return (versetsChapitre || [])
    .filter((x) => x.number >= r.v && x.number <= fin)
    .map((x) => x.text)
    .join(" ");
}

const cache = new Map(); // rang du livre -> Promise<données>
/** Fichier d'un livre (rang 1 à 66), chargé une fois. Un livre sans références donne {}. */
export function chargerLivre(rang) {
  if (!cache.has(rang)) {
    const p = fetch(`/data/references/${rang}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => { cache.delete(rang); throw new Error("Références indisponibles."); });
    cache.set(rang, p);
  }
  return cache.get(rang);
}
