// Accès local (hors API externe) aux textes bibliques intégrés à l'application.
//
// Sources de référence : les fichiers statiques servis par l'app —
//   - /data/bibles/lsg1910_fr_CORRIGE.json  (Louis Segond 1910, français)
//   - /data/bibles/malagasy_complete.json   (Baiboly Malagasy 1865)
// Structure réelle de ces fichiers :
//   { version, title, language, testament: { OT: { name, books: [...] },
//     NT: { name, books: [...] } } }
//   livre    : { book_id, book_name, chapters: [...] }
//   chapitre : { chapter: N, verses: [{ verse: N, text }] }
// Les livres sont conservés dans l'ordre canonique (OT puis NT), sans
// aucune modification du contenu biblique.
//
// Fonctionnement hors ligne :
//   1. la réponse HTTP est mise en cache durable via la Cache Storage API
//      (`offlineCache`), réutilisée ensuite sans réseau ;
//   2. le service worker enregistre également ces fichiers dans un cache
//      d'app shell (voir public/sw.js) ;
//   3. une copie IndexedDB sert de dernier repli si Cache Storage échoue.
// Une fois l'application installée/ouverte au moins une fois avec connexion
// (ou servie localement comme en natif Capacitor), la Bible complète reste
// consultable sans Internet.

import { getCachedJson, setCachedJson } from "./offlineCache.js";

export const LOCAL_BIBLES = {
  fr: { file: "lsg1910_fr_CORRIGE.json", label: "Louis Segond 1910 (LSG)" },
  mg: { file: "malagasy_complete.json", label: "Baiboly Malagasy 1865" },
};

const FETCH_CACHE_KEY = "bible-local-json-v2"; // versionné : invalide tout au rechargement
const IDB_NAME = "chay-bible-local";
const IDB_STORE = "json";

function bibleUrl(lang) {
  return `/data/bibles/${LOCAL_BIBLES[lang].file}`;
}

// --- Repli IndexedDB (silencieux si indisponible) ---------------------------

function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* stockage non disponible : Cache Storage reste la source principale */
  }
}

// --- Normalisation (structure → formes attendues par l'UI) -----------------

// Catalogue des livres d'une langue, trié dans l'ordre canonique.
// `order` = rang canonique 1..66 (identique FR/MG, mêmes book_id).
export function normalizeLocalBooks(raw) {
  const flat = [...(raw?.testament?.OT?.books || []), ...(raw?.testament?.NT?.books || [])];
  return flat
    .map((b, i) => ({
      id: b.book_id,
      name: b.book_name,
      order: i + 1,
      numberOfChapters: Array.isArray(b.chapters) ? b.chapters.length : 0,
    }))
    // Un livre vide dans le fichier source reste listé (numberOfChapters = 0)
    // pour que l'absence de texte soit signalée, jamais masquée.
    .filter((b) => b.id && b.name);
}

// Versets d'un chapitre : [{ number, text }] — texte original préservé.
export function normalizeLocalChapter(raw, bookId, chapter) {
  const flat = [...(raw?.testament?.OT?.books || []), ...(raw?.testament?.NT?.books || [])];
  const book = flat.find((b) => b.book_id === bookId);
  const ch = book?.chapters?.find((c) => Number(c.chapter) === Number(chapter));
  if (!Array.isArray(ch?.verses)) return [];
  return ch.verses
    .map((v) => ({
      number: Number(v.verse),
      text: String(v.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((v) => Number.isFinite(v.number) && v.text.length > 0)
    .sort((a, b) => a.number - b.number);
}

// --- Chargement avec caches persistants -------------------------------------

const memoryRaw = {}; // crue par langue (par session)
const memoryBooks = {}; // catalogue par langue (par session)

async function fetchAndPersist(lang) {
  const url = bibleUrl(lang);
  const res = await fetch(url, { cache: "default" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.testament?.OT?.books || !data?.testament?.NT?.books) {
    throw new Error("Structure de fichier biblique inattendue.");
  }
  // Persistance best-effort : Cache Storage puis IndexedDB.
  setCachedJson(`${FETCH_CACHE_KEY}:${url}`, data).catch(() => {});
  idbPut(`${FETCH_CACHE_KEY}:${url}`, data).catch(() => {});
  return data;
}

// Retourne le JSON brut d'une Bible locale, en privilégiant la mémoire,
// puis le cache persistant, puis le réseau (qui alimente alors les caches).
export async function loadLocalBibleRaw(lang) {
  if (!LOCAL_BIBLES[lang]) throw new Error("Langue biblique inconnue.");
  if (memoryRaw[lang]) return memoryRaw[lang];
  const url = bibleUrl(lang);
  let data = await getCachedJson(`${FETCH_CACHE_KEY}:${url}`).catch(() => null);
  if (!data?.testament) data = await idbGet(`${FETCH_CACHE_KEY}:${url}`);
  if (!data?.testament) data = await fetchAndPersist(lang);
  memoryRaw[lang] = data;
  return data;
}

// Catalogue des 66 livres (mémoïsé par langue et par session).
export async function getLocalBooks(lang) {
  if (memoryBooks[lang]?.length) return memoryBooks[lang];
  const raw = await loadLocalBibleRaw(lang);
  const books = normalizeLocalBooks(raw);
  if (books.length === 0) throw new Error("Aucun livre trouvé dans le fichier biblique local.");
  memoryBooks[lang] = books;
  return books;
}

// Versets d'un chapitre, depuis le fichier local (aucune requête réseau
// après le premier chargement de la langue).
export async function getLocalChapterVerses(lang, bookId, chapter) {
  const raw = await loadLocalBibleRaw(lang);
  return normalizeLocalChapter(raw, bookId, chapter);
}

// Résout un identifiant de livre quel que soit le jeu d'ids utilisé par
// l'appelant (OSIS « JHN », slug malgache « jaona », id local « JA ») :
// on compare des formes normalisées (minuscules, sans accents ni ponctuation).
export function findLocalBookId(books, wanted) {
  if (!wanted || !Array.isArray(books)) return null;
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  const w = norm(wanted);
  if (!w) return null;
  return (
    books.find((b) => norm(b.id) === w)?.id ??
    books.find((b) => norm(b.name) === w)?.id ??
    null
  );
}