// Dictionnaire biblique Westphal : base SQLite téléchargée une seule fois,
// conservée sur l'appareil (Cache Storage), puis ouverte en lecture seule
// avec sql.js (SQLite compilé en WebAssembly) — aucune requête réseau ensuite.
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

export const DICTIONARY_DB_URL =
  "https://raw.githubusercontent.com/ramarozatofenosoa-chay/dictionnaire-biblique-db/main/dictionnaire_westphal.db";

const CACHE_NAME = "chay-dictionary-db-v1";
const LOCAL_KEY = "https://offline.chay.local/dictionnaire_westphal.db";

let dbPromise = null;

function hasCache() {
  return typeof caches !== "undefined";
}

// Lecture du fichier local, s'il a déjà été téléchargé.
async function readLocalFile() {
  if (!hasCache()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(LOCAL_KEY);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function saveLocalFile(bytes) {
  if (!hasCache()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(LOCAL_KEY, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
  } catch {
    /* stockage plein ou indisponible : la base reste utilisable pour la session */
  }
}

// Copie embarquée dans l'application (APK) : disponible dès l'installation,
// sans aucune connexion. L'adresse distante ne sert que de secours.
const BUNDLED_DB_URL = "/data/dictionaries/dictionnaire_westphal.db";

// Un fichier SQLite valide commence par « SQLite format 3 ».
function isSqlite(bytes) {
  return bytes.length > 16 && String.fromCharCode(...bytes.slice(0, 15)) === "SQLite format 3";
}

async function readBundledFile() {
  try {
    const res = await fetch(BUNDLED_DB_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return isSqlite(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

// Télécharge le .db avec progression (0..1, ou null si la taille est inconnue).
async function downloadFile(onProgress) {
  const bundled = await readBundledFile();
  if (bundled) return bundled;
  if (!navigator.onLine) throw new Error('Le dictionnaire embarqué est indisponible.');
  const res = await fetch(DICTIONARY_DB_URL);
  if (!res.ok) throw new Error("Téléchargement impossible. Vérifiez votre connexion.");
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(total ? Math.min(received / total, 1) : null);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

// Ouvre la base (téléchargement au premier lancement). Mise en mémoire :
// une seule ouverture par session.
export function openDictionary(onProgress) {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    let bytes = await readLocalFile();
    if (!bytes) {
      bytes = await downloadFile(onProgress);
      await saveLocalFile(bytes);
    }
    const db = new SQL.Database(bytes);
    // Lecture seule : aucune écriture n'est jamais émise sur cette base.
    db.run("PRAGMA query_only = ON");
    return db;
  })().catch((e) => {
    dbPromise = null; // permet « Réessayer »
    throw e;
  });
  return dbPromise;
}

function rows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

// Vrai si le fichier du dictionnaire est déjà sur l'appareil.
export async function isDictionaryDownloaded() {
  if (!hasCache()) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    return !!(await cache.match(LOCAL_KEY));
  } catch {
    return false;
  }
}

// Casse + accents ignorés (« Éden » = « eden »), pour tri, lettres et recherche.
export function fold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .trim();
}

// Lettre de rangement : « É » → E, « Â » → A, « Œ » → O.
function baseLetter(l) {
  const f = fold(l)[0];
  return f && /[a-z]/.test(f) ? f.toUpperCase() : "";
}

const collator = new Intl.Collator("fr", { sensitivity: "base" });

// Écran 1 : lettres présentes dans la base (accentuées regroupées sous A–Z).
export function getLetters(db) {
  const set = new Set(
    rows(db, "SELECT DISTINCT lettre FROM definitions ORDER BY lettre").map((r) => baseLetter(r.lettre))
  );
  set.delete("");
  return [...set].sort();
}

// Écran 2 : mots d'une lettre (y compris les variantes accentuées), tri français.
export function getWordsByLetter(db, letter) {
  const found = rows(db, "SELECT DISTINCT lettre FROM definitions")
    .map((r) => r.lettre)
    .filter((l) => baseLetter(l) === letter);
  if (!found.length) return [];
  const marks = found.map(() => "?").join(",");
  const list = rows(db, `SELECT mot, titre FROM definitions WHERE lettre IN (${marks}) ORDER BY mot`, found);
  const unique = [...new Map(list.map((w) => [w.mot, w])).values()];
  return unique.sort((a, b) => collator.compare(a.mot, b.mot));
}

// Les titres de la base sont suivis de la mention de la source collée au mot
// (« GabaonDictionnaire Biblique WestphalBostCalmet ») : on la retire partout.
export function cleanTitle(titre, mot) {
  const t = String(titre || "").replace(/Dictionnaire\s*Biblique.*$/i, "").trim();
  return t || mot;
}

// Écran 3 : définitions d'un mot (certains mots en ont plusieurs).
export function getDefinitions(db, mot) {
  return rows(db, "SELECT titre, contenu FROM definitions WHERE mot = ? ORDER BY id", [mot]).map((d) => ({
    ...d,
    titre: cleanTitle(d.titre, mot),
  }));
}

// Suggestions : insensibles à la casse ET aux accents (« eze » trouve « Ézéchiel »).
// On filtre côté JS sur la liste des mots (5 436 lignes, instantané).
let wordCache = new WeakMap();
function allWords(db) {
  let list = wordCache.get(db);
  if (!list) {
    const all = rows(db, "SELECT mot, titre FROM definitions ORDER BY mot");
    list = [...new Map(all.map((r) => [r.mot, { ...r, key: fold(r.mot) }])).values()];
    list.sort((a, b) => collator.compare(a.mot, b.mot));
    wordCache.set(db, list);
  }
  return list;
}

export function searchWords(db, query, limit = 20) {
  const q = fold(query);
  if (!q) return [];
  const list = allWords(db);
  const starts = list.filter((w) => w.key.startsWith(q));
  const contains = starts.length < limit ? list.filter((w) => !w.key.startsWith(q) && w.key.includes(q)) : [];
  return [...starts, ...contains].slice(0, limit).map(({ mot, titre }) => ({ mot, titre }));
}