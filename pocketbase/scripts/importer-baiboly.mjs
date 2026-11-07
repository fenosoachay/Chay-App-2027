#!/usr/bin/env node
// Import ponctuel des chapitres manquants du Baiboly Malagasy 1865 (translation = "malagasy").
//
//   node pocketbase/scripts/importer-baiboly.mjs                    simulation HORS LIGNE : état, chapitres manquants
//   node pocketbase/scripts/importer-baiboly.mjs --telecharger --autoriser-post
//        télécharge les chapitres manquants dans le cache (reprise possible : un chapitre en cache n'est
//        plus redemandé ; pause entre les requêtes). La source n'accepte QUE des POST en lecture
//        (/api/public/versets/<testament>, même appel que la fonction Base44 syncBibleTranslation) :
//        d'où l'option explicite --autoriser-post.
//   node pocketbase/scripts/importer-baiboly.mjs --appliquer        insère depuis le cache (sans réseau),
//        puis vérifie et met à jour BibleTranslation (status "ready" seulement si la traduction est complète).
// Options : --pb <url> (127.0.0.1 seulement), --pause <ms> (défaut 1500), --livre <bookOrder> (limiter).
//
// Garanties : rien n'est jamais modifié ni supprimé dans les versets existants (données Base44) ;
// clé (translation, bookOrder, chapter, verse) vérifiée avant chaque création : relancer ne crée aucun doublon.
// Sorties : C:\Export-Base44\_outil\pb\baiboly-rapport.md ; cache : C:\Export-Base44\_outil\pb\baiboly-cache\.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = 'C:\\Export-Base44\\_outil\\pb';
const CACHE = path.join(OUT, 'baiboly-cache');
const REPORT = path.join(OUT, 'baiboly-rapport.md');
const SOURCE = 'https://back.baiboly.antonionavira.mg/api/public';
const T = 'malagasy';

export function parseArgs(argv) {
  const a = { pb: 'http://127.0.0.1:8090', telecharger: false, autoriserPost: false, appliquer: false, pause: 1500, livre: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--pb') a.pb = argv[++i];
    else if (k === '--telecharger') a.telecharger = true;
    else if (k === '--autoriser-post') a.autoriserPost = true;
    else if (k === '--appliquer') a.appliquer = true;
    else if (k === '--pause') a.pause = Number(argv[++i]);
    else if (k === '--livre') a.livre = Number(argv[++i]);
    else throw new Error(`option inconnue : ${k}`);
  }
  if (!['127.0.0.1', 'localhost'].includes(new URL(a.pb).hostname)) throw new Error('bac à sable 127.0.0.1 seulement');
  if (a.telecharger && !a.autoriserPost) throw new Error('--telecharger exige --autoriser-post (la source n\'accepte que POST)');
  if (!(a.pause >= 1000)) throw new Error('--pause : 1000 ms minimum');
  return a;
}

/** Catalogue des 66 livres (ordre = bookOrder), lu dans base44/shared/malagasyBooks.ts. */
export function catalog() {
  const src = fs.readFileSync(path.join(ROOT, 'base44', 'shared', 'malagasyBooks.ts'), 'utf8');
  return [...src.matchAll(/\{ slug: "([^"]+)", name: "([^"]+)", chapters: (\d+), testament: "(ot|nt)" \}/g)]
    .map((m, i) => ({ order: i + 1, slug: m[1], name: m[2], chapters: Number(m[3]), testament: m[4] }));
}

/** Même normalisation que base44/shared/bibleNormalize.ts pour le malgache. */
export const normalize = (t) => String(t || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

/** Réponse de la source -> versets [{ number, text }] (même lecture que syncBibleTranslation). */
export function parseSource(json) {
  if (json?.statut !== 200) throw new Error(json?.message ? 'erreur de la source' : 'réponse inattendue');
  const rows = [];
  for (const obj of json?.data?.text || []) {
    if (!obj || typeof obj !== 'object') continue;
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && typeof v === 'string') {
        const text = v.replace(/\s+/g, ' ').trim();
        if (text) rows.push({ number: n, text });
      }
    }
  }
  return rows.sort((x, y) => x.number - y.number);
}

const cacheFile = (book, ch) => path.join(CACHE, `${String(book.order).padStart(2, '0')}-${book.slug}-${String(ch).padStart(3, '0')}.json`);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function download(book, ch) {
  const res = await fetch(`${SOURCE}/versets/${book.testament === 'ot' ? 'testameta_taloha' : 'testameta_vaovao'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'chay-import/1.0 (lecture seule)' },
    body: JSON.stringify({ book: book.slug, chapter: ch, start: 1, end: 300 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSource(await res.json());
}

// ── PocketBase (superuser du bac à sable) ────────────────────────────────────
function superuserCreds() {
  if (process.env.PB_SU_EMAIL && process.env.PB_SU_PASSWORD) return [process.env.PB_SU_EMAIL, process.env.PB_SU_PASSWORD];
  const line = fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt', 'utf8').split(/\r?\n/).find((l) => l.startsWith('superuser\t'));
  const [, email, password] = line.split('\t');
  return [email, password];
}

async function pb(base) {
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(call.token ? { Authorization: call.token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`${method} ${p.split('?')[0]} : HTTP ${res.status}`), { status: res.status });
    return data;
  };
  const [identity, password] = superuserCreds();
  call.token = (await call('POST', '/api/collections/_superusers/auth-with-password', { identity, password })).token;
  return call;
}

/** Tous les versets malgaches : Map "livre:chapitre:verset" -> [{ id, text }] (plusieurs = doublon). */
async function loadVerses(call) {
  const map = new Map();
  for (let page = 1; ; page++) {
    const r = await call('GET', `/api/collections/BibleVerse/records?perPage=1000&page=${page}&skipTotal=1&sort=bookOrder,chapter,verse&fields=id,bookOrder,chapter,verse,text&filter=${encodeURIComponent(`translation="${T}"`)}`);
    for (const v of r.items) {
      const k = `${v.bookOrder}:${v.chapter}:${v.verse}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ id: v.id, text: v.text });
    }
    if (r.items.length < 1000) break;
  }
  return map;
}

/** État par chapitre : nombre de versets, trous de numérotation, doublons. */
export function analyse(books, map) {
  const chapters = [];
  for (const b of books) {
    for (let ch = 1; ch <= b.chapters; ch++) {
      const nums = [];
      let dup = 0;
      for (let v = 1; v <= 200; v++) {
        const e = map.get(`${b.order}:${ch}:${v}`);
        if (e) { nums.push(v); if (e.length > 1) dup += e.length - 1; }
      }
      const max = nums.length ? nums[nums.length - 1] : 0;
      chapters.push({ book: b, ch, count: nums.length, max, gaps: max - nums.length, dup });
    }
  }
  const known = new Set(books.flatMap((b) => Array.from({ length: b.chapters }, (_, i) => `${b.order}:${i + 1}`)));
  const outside = [...map.keys()].filter((k) => !known.has(k.split(':').slice(0, 2).join(':'))).length;
  return { chapters, outside };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const books = catalog();
  if (books.length !== 66 || books.reduce((s, b) => s + b.chapters, 0) !== 1189) throw new Error('catalogue malagasyBooks.ts inattendu');
  fs.mkdirSync(CACHE, { recursive: true });
  const call = await pb(args.pb.replace(/\/+$/, ''));
  let map = await loadVerses(call);
  const before = analyse(books, map);
  const totalBefore = [...map.values()].reduce((s, e) => s + e.length, 0);
  const scope = (c) => args.livre === null || c.book.order === args.livre;
  const missing = before.chapters.filter((c) => c.count === 0 && scope(c));
  const incomplete = before.chapters.filter((c) => c.count > 0 && c.gaps > 0 && scope(c));
  const toFetch = [...missing, ...incomplete];

  // ── Téléchargement (cache, reprise) ──────────────────────────────────────
  const fetchErrors = [];
  if (args.telecharger) {
    let n = 0;
    for (const c of toFetch) {
      const f = cacheFile(c.book, c.ch);
      if (fs.existsSync(f)) continue;
      try {
        const verses = await download(c.book, c.ch);
        fs.writeFileSync(f, JSON.stringify({ bookOrder: c.book.order, slug: c.book.slug, chapter: c.ch, verses, fetchedAt: new Date().toISOString() }));
        n++;
      } catch (err) {
        fetchErrors.push(`${c.book.name} ${c.ch} : ${err.message}`);
      }
      process.stdout.write(`\rtéléchargés : ${n} / ${toFetch.length}`);
      await sleep(args.pause);
    }
    process.stdout.write('\n');
  }

  // ── Plan depuis le cache ─────────────────────────────────────────────────
  const plan = [];
  const conflicts = [];
  const sourceEmpty = [];
  const notCached = [];
  for (const c of toFetch) {
    const f = cacheFile(c.book, c.ch);
    if (!fs.existsSync(f)) { notCached.push(c); continue; }
    const cached = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!cached.verses.length) { sourceEmpty.push(c); continue; }
    for (const v of cached.verses) {
      const e = map.get(`${c.book.order}:${c.ch}:${v.number}`);
      if (!e) plan.push({ translation: T, book: c.book.name, bookOrder: c.book.order, chapter: c.ch, verse: v.number, text: v.text, normalizedText: normalize(v.text) });
      else if (e[0].text.replace(/\s+/g, ' ').trim() !== v.text) conflicts.push(`${c.book.name} ${c.ch}:${v.number}`);
    }
  }

  // ── Application ──────────────────────────────────────────────────────────
  let created = 0;
  let translationUpdate = null;
  if (args.appliquer) {
    for (let i = 0; i < plan.length; i += 8) {
      await Promise.all(plan.slice(i, i + 8).map(async (row) => {
        // Relecture de la clé juste avant la création : pas de doublon même si un autre import tourne.
        const k = encodeURIComponent(`translation="${T}" && bookOrder=${row.bookOrder} && chapter=${row.chapter} && verse=${row.verse}`);
        const exists = await call('GET', `/api/collections/BibleVerse/records?perPage=1&skipTotal=1&fields=id&filter=${k}`);
        if (exists.items.length) return;
        await call('POST', '/api/collections/BibleVerse/records', row);
        created++;
      }));
      if (plan.length > 200) process.stdout.write(`\rcréés : ${created} / ${plan.length}`);
    }
    if (plan.length > 200) process.stdout.write('\n');
    map = await loadVerses(call);
  }

  // ── Vérification finale et statut de la traduction ───────────────────────
  const after = analyse(books, map);
  const totalAfter = [...map.values()].reduce((s, e) => s + e.length, 0);
  const empty = after.chapters.filter((c) => c.count === 0);
  const gaps = after.chapters.filter((c) => c.gaps > 0);
  const dups = after.chapters.reduce((s, c) => s + c.dup, 0);
  const complete = !empty.length && !gaps.length && !dups && !after.outside;
  const tr = (await call('GET', `/api/collections/BibleTranslation/records?perPage=1&filter=${encodeURIComponent(`translation_id="${T}"`)}`)).items[0];
  const firstMissing = empty[0] || gaps[0];
  const wanted = {
    status: complete ? 'ready' : 'partial',
    verseCount: totalAfter,
    syncCursorBookOrder: complete ? 67 : firstMissing.book.order,
    syncCursorChapter: complete ? 1 : firstMissing.ch,
  };
  if (args.appliquer && tr) {
    const changed = Object.keys(wanted).filter((k) => tr[k] !== wanted[k]);
    if (changed.length) {
      await call('PATCH', `/api/collections/BibleTranslation/records/${tr.id}`, { ...wanted, lastSyncedAt: new Date().toISOString() });
    }
    translationUpdate = changed;
  }

  // ── Rapport ──────────────────────────────────────────────────────────────
  const byBook = books.map((b) => {
    const cs = after.chapters.filter((c) => c.book.order === b.order);
    const was = before.chapters.filter((c) => c.book.order === b.order);
    return { b, present: cs.filter((c) => c.count).length, verses: cs.reduce((s, c) => s + c.count, 0), missingBefore: was.filter((c) => !c.count).map((c) => c.ch) };
  });
  const ranges = (nums) => {
    const out = [];
    for (let i = 0; i < nums.length; i++) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`);
      i = j;
    }
    return out.join(', ');
  };
  const L = [`# Import du Baiboly Malagasy 1865 — ${args.appliquer ? 'APPLICATION' : 'SIMULATION'}`, '',
    `- Versets avant : ${totalBefore} ; après : ${totalAfter} ; créés : ${created} ; textes différents de la source (non modifiés) : ${conflicts.length}`,
    `- Chapitres présents : ${before.chapters.filter((c) => c.count).length} / 1189 avant, ${after.chapters.filter((c) => c.count).length} / 1189 après`,
    `- Chapitres vides : ${empty.length} ; chapitres à trous de numérotation : ${gaps.length} ; doublons : ${dups} ; versets hors catalogue : ${after.outside}`,
    `- À télécharger : ${toFetch.length} chapitres ; pas encore en cache : ${notCached.length} ; vides à la source : ${sourceEmpty.length}${fetchErrors.length ? ` ; erreurs : ${fetchErrors.length}` : ''}`,
    `- Statut BibleTranslation : actuel « ${tr?.status} » ; attendu « ${wanted.status} »${translationUpdate ? ` ; mis à jour : ${translationUpdate.join(', ') || 'rien à changer'}` : ''}`,
    '', '| # | Livre | Chapitres présents | Versets | Chapitres manquants avant |', '|---|---|---|---|---|'];
  for (const r of byBook) L.push(`| ${r.b.order} | ${r.b.name} | ${r.present} / ${r.b.chapters} | ${r.verses} | ${r.missingBefore.length ? ranges(r.missingBefore) : '—'} |`);
  if (incomplete.length) L.push('', '## Chapitres à trous avant import', '', ...incomplete.map((c) => `- ${c.book.name} ${c.ch} : ${c.count} versets, dernier n° ${c.max}`));
  if (sourceEmpty.length) L.push('', '## Chapitres vides à la source', '', ...sourceEmpty.map((c) => `- ${c.book.name} ${c.ch}`));
  if (conflicts.length) L.push('', '## Textes existants différents de la source (conservés)', '', ...conflicts.slice(0, 200).map((x) => `- ${x}`));
  if (fetchErrors.length) L.push('', '## Erreurs de téléchargement', '', ...fetchErrors.map((x) => `- ${x}`));
  fs.writeFileSync(REPORT, L.join('\n') + '\n');

  console.log(`Mode : ${args.appliquer ? 'application' : 'simulation'}${args.telecharger ? ' + téléchargement' : ' (hors ligne)'}`);
  console.log(`Chapitres présents : ${after.chapters.filter((c) => c.count).length} / 1189 ; vides : ${empty.length} ; à trous : ${gaps.length} ; doublons : ${dups}`);
  console.log(`Versets : ${totalBefore} -> ${totalAfter} (créés ${created}, à créer depuis le cache ${args.appliquer ? 0 : plan.length}) ; conflits non écrasés : ${conflicts.length}`);
  console.log(`Livres incomplets : ${byBook.filter((r) => r.present < r.b.chapters).length} ; chapitres absents du cache : ${notCached.length}`);
  console.log(`Statut : « ${tr?.status} » -> « ${wanted.status} »${args.appliquer ? '' : ' (non appliqué)'}`);
  console.log(`Rapport : ${REPORT}`);
  return { complete, empty: empty.length, created, notCached: notCached.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main().catch((err) => { console.error(`Échec : ${err.message}`); process.exit(1); });
}
