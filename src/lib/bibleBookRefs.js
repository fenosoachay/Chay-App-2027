// Résolution d'une référence textuelle (« Jean 3:16 », « 1er Rois 2 ») vers un
// livre du catalogue local. Sert aux liens ?ref=… (dévotionnels, accueil).

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Noms français usuels (sans accents) → identifiant du fichier biblique.
const FR_BOOK_TO_ID = {
  genese: "GEN", exode: "EXO", levitique: "LEV", nombres: "NUM", deuteronome: "DEU",
  deuteronomique: "DEU", josue: "JOS", juges: "JDG", ruth: "RUT",
  "1 samuel": "1SA", "2 samuel": "2SA", "1 rois": "1KI", "2 rois": "2KI",
  "1 chroniques": "1CH", "2 chroniques": "2CH", esdras: "EZR", nehemie: "NEH", esther: "EST",
  job: "JOB", psaumes: "PSA", psaume: "PSA", proverbes: "PRO", ecclesiaste: "ECC",
  cantique: "SNG", "cantique des cantiques": "SNG",
  esaie: "ISA", isaie: "ISA", jeremie: "JER", lamentations: "LAM", ezechiel: "EZK", daniel: "DAN",
  osee: "HOS", joel: "JOL", amos: "AMO", abdias: "OBA", jonas: "JON",
  michee: "MIC", nahum: "NAM", habacuc: "HAB", sophonie: "ZEP", aggee: "HAG",
  zacharie: "ZEC", malachie: "MAL",
  matthieu: "MAT", marc: "MRK", luc: "LUK", jean: "JHN", actes: "ACT",
  romains: "ROM", "1 corinthiens": "1CO", "2 corinthiens": "2CO", galates: "GAL",
  ephesiens: "EPH", philippiens: "PHP", colossiens: "COL",
  "1 thessaloniciens": "1TH", "2 thessaloniciens": "2TH",
  "1 timothee": "1TI", "2 timothee": "2TI", tite: "TIT", philemon: "PHM",
  hebreux: "HEB", jacques: "JAS",
  "1 pierre": "1PE", "2 pierre": "2PE",
  "1 jean": "1JN", "2 jean": "2JN", "3 jean": "3JN", jude: "JUD",
  apocalypse: "REV",
};

// Retourne { bookId, chapter, verse } ou null si la référence est illisible
// ou si le livre n'existe pas dans le catalogue.
export function parseReference(ref, books) {
  const m = String(ref || "").trim().match(/^(.*?)\s+(\d+)(?::(\d+))?$/);
  if (!m || !Array.isArray(books)) return null;
  const rawBook = norm(m[1]).replace(/^(\d)\s*(?:er|ere|re|eme)\s*/, "$1 ");
  const frId = FR_BOOK_TO_ID[rawBook];
  const book = frId
    ? books.find((b) => b.id === frId)
    : books.find((b) => norm(b.name) === rawBook || norm(b.id) === rawBook);
  if (!book) return null;
  return {
    bookId: book.id,
    chapter: Number(m[2]),
    verse: m[3] ? Number(m[3]) : null,
  };
}