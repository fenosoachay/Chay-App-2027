#!/usr/bin/env node
// Tests d'intégration du bloc 2 (pilote) contre le BAC À SABLE LOCAL uniquement.
//   node pocketbase/tests/fn-pilote.integration.mjs
// - URL : PB_TEST_URL (défaut http://127.0.0.1:8090) ; toute autre machine que 127.0.0.1 / localhost est refusée.
// - Identifiants : PB_TEST_CREDENTIALS (défaut C:\PB-local\identifiants-test.txt), jamais affichés.
// - Chaque test remet les données dans leur état initial (compteurs restaurés, enregistrements de test supprimés).
// - Aucune donnée personnelle n'est affichée : seulement des statuts, des noms de champs et des nombres.
// Les « attendus » reproduisent le comportement de base44/functions/<nom>/entry.ts.

import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = (process.env.PB_TEST_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const host = new URL(BASE).hostname;
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Refusé : ces tests ne visent que le bac à sable local (reçu : ${host}).`);
  process.exit(2);
}

// ── Identifiants ─────────────────────────────────────────────────────────────
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = {};
for (const line of fs.readFileSync(credFile, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const [label, email, password, id] = line.split('\t');
  creds[label] = { email, password, id };
}
for (const k of ['superuser', 'admin', 'membre']) {
  if (!creds[k]) { console.error(`Identifiant « ${k} » absent de ${credFile}`); process.exit(2); }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function http(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
async function login(collection, c) {
  // Limites de tentatives du bac à sable : on patiente et on réessaie sur 429.
  for (let attempt = 0; ; attempt++) {
    const r = await http('POST', `/api/collections/${collection}/auth-with-password`, { body: { identity: c.email, password: c.password } });
    if (r.status === 200) return r.data.token;
    if (r.status !== 429 || attempt >= 14) throw new Error(`connexion ${collection} impossible (HTTP ${r.status})`);
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}
const fn = (name, opts) => http('POST', `/api/fn/${name}`, opts);

// ── Mini-exécuteur de tests ──────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
const sameKeys = (o, keys) => o && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...keys].sort());
const keysOf = (o) => (o ? Object.keys(o).sort().join(',') : String(o));

// ── Tests ────────────────────────────────────────────────────────────────────
const su = await login('_superusers', creds.superuser);
const admin = await login('users', creds.admin);
const membre = await login('users', creds.membre);
const asSu = { token: su };

console.log('\n■ Refus anonymes (aucun jeton)');
for (const [name, msg] of [
  ['listCommunityUsers', 'Connexion requise'],
  ['getPrayerWall', 'Connexion requise.'],
  ['recordMediaListen', 'Unauthorized'],
  ['recordVideoView', 'Unauthorized'],
]) {
  const r = await fn(name, { body: {} });
  check(`${name} anonyme -> 401 { error: "${msg}" }`, r.status === 401 && r.data?.error === msg, `HTTP ${r.status}, clés ${keysOf(r.data)}`);
}
{
  const r = await fn('listCommunityUsers', { token: 'jeton-invalide', body: {} });
  check('jeton invalide -> refusé (401)', r.status === 401, `HTTP ${r.status}`);
  const s = await fn('listCommunityUsers', { token: su, body: {} });
  check('superuser (pas un compte de l’app) -> 401', s.status === 401, `HTTP ${s.status}`);
}

console.log('\n■ listCommunityUsers');
{
  const total = (await http('GET', '/api/collections/users/records?perPage=1&fields=id', asSu)).data.totalItems;
  const expected = await http('GET', '/api/collections/users/records?perPage=100&sort=-base44_created_date,-created&fields=id', asSu);
  for (const [who, token] of [['membre', membre], ['admin', admin]]) {
    const r = await fn('listCommunityUsers', { token, body: {} });
    const users = r.data?.users;
    check(`${who} -> 200 { users: [...] }`, r.status === 200 && sameKeys(r.data, ['users']) && Array.isArray(users));
    check(`${who} : ${Math.min(100, total)} utilisateurs (limite 100, comme Base44)`, users?.length === Math.min(100, total), `reçu ${users?.length}`);
    check(`${who} : uniquement id, first_name, last_name, profile_photo_url, role`,
      users?.every((u) => sameKeys(u, ['id', 'first_name', 'last_name', 'profile_photo_url', 'role'])));
    check(`${who} : chaînes vides plutôt que null (|| '' comme Base44)`,
      users?.every((u) => ['first_name', 'last_name', 'profile_photo_url'].every((k) => typeof u[k] === 'string')));
    check(`${who} : ordre -created_date`, JSON.stringify(users?.map((u) => u.id)) === JSON.stringify(expected.data.items.map((u) => u.id)));
  }
  const r = await fn('listCommunityUsers', { token: membre, raw: 'pas du json' });
  check('corps invalide ignoré (pas de paramètre attendu) -> 200', r.status === 200);
}

console.log('\n■ getPrayerWall');
{
  const created = [];
  try {
    const mk = async (status) => {
      const r = await http('POST', '/api/collections/PrayerRequest/records', {
        ...asSu, body: { requester_id: creds.membre.id, taken_by: creds.admin.id, category: 'Autre', content: 'test pilote', status, created_by_id: creds.membre.id },
      });
      if (r.status !== 200) throw new Error(`création PrayerRequest de test : HTTP ${r.status} ${keysOf(r.data?.data)}`);
      created.push(r.data.id);
      return r.data.id;
    };
    const openId = await mk('open');
    const closedId = await mk('answered');
    const openTotal = (await http('GET', "/api/collections/PrayerRequest/records?perPage=1&fields=id&filter=status%3D'open'", asSu)).data.totalItems;
    for (const [who, token] of [['membre', membre], ['admin', admin]]) {
      const r = await fn('getPrayerWall', { token, body: {} });
      check(`${who} -> 200 { items, count }`, r.status === 200 && sameKeys(r.data, ['items', 'count']));
      check(`${who} : count = items.length = prières ouvertes (${openTotal})`, r.data?.count === r.data?.items?.length && r.data?.count === Math.min(200, openTotal));
      const mine = r.data?.items?.find((i) => i.id === openId);
      check(`${who} : prière ouverte présente avec id, category, content, created_date, status`, sameKeys(mine, ['id', 'category', 'content', 'created_date', 'status']), keysOf(mine));
      check(`${who} : requester_id / taken_by jamais exposés`, r.data?.items?.every((i) => !('requester_id' in i) && !('taken_by' in i)));
      check(`${who} : prière non ouverte absente`, !r.data?.items?.some((i) => i.id === closedId));
      check(`${who} : created_date au format ISO`, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(mine?.created_date || ''));
    }
  } finally {
    for (const id of created) await http('DELETE', `/api/collections/PrayerRequest/records/${id}`, asSu);
  }
}

console.log('\n■ recordMediaListen');
{
  for (const [label, body, status, msg] of [
    ['sans playlist_track_id', {}, 400, 'playlist_track_id required'],
    ['playlist_track_id non texte', { playlist_track_id: 123 }, 400, 'playlist_track_id required'],
    ['playlist_track_id vide', { playlist_track_id: '' }, 400, 'playlist_track_id required'],
    ['piste inexistante', { playlist_track_id: 'f'.repeat(24) }, 404, 'audio track not found'],
  ]) {
    const r = await fn('recordMediaListen', { token: membre, body });
    check(`${label} -> ${status} { error: "${msg}" }`, r.status === status && r.data?.error === msg, `HTTP ${r.status}`);
  }
  const tracks = (await http('GET', "/api/collections/PlaylistTrack/records?perPage=1&filter=audio_url!%3D''&fields=id,listen_count,base44_updated_date", asSu)).data.items;
  if (!tracks.length) {
    check('piste audio disponible pour le test', false, 'aucune PlaylistTrack avec audio_url');
  } else {
    const t = tracks[0];
    try {
      const before = Math.max(0, Math.floor(Number(t.listen_count) || 0));
      const r1 = await fn('recordMediaListen', { token: membre, body: { playlist_track_id: t.id, user_id: creds.admin.id } });
      check('membre -> 200 { listen_count: avant + 1 }', r1.status === 200 && sameKeys(r1.data, ['listen_count']) && r1.data.listen_count === before + 1);
      const r2 = await fn('recordMediaListen', { token: admin, body: { playlist_track_id: t.id } });
      check('admin -> +1 encore (pas de dédoublonnage, comme Base44)', r2.data?.listen_count === before + 2);
      const db = (await http('GET', `/api/collections/PlaylistTrack/records/${t.id}?fields=listen_count,base44_updated_date`, asSu)).data;
      check('valeur enregistrée en base', db.listen_count === before + 2);
      check('hook : base44_updated_date mise à jour', db.base44_updated_date !== t.base44_updated_date);
    } finally {
      await http('PATCH', `/api/collections/PlaylistTrack/records/${t.id}`, { ...asSu, body: { listen_count: t.listen_count, base44_updated_date: t.base44_updated_date } });
      const back = (await http('GET', `/api/collections/PlaylistTrack/records/${t.id}?fields=listen_count,base44_updated_date`, asSu)).data;
      check('état initial restauré', back.listen_count === t.listen_count && back.base44_updated_date === t.base44_updated_date);
    }
  }
}

console.log('\n■ recordVideoView');
{
  for (const [label, body, status, msg] of [
    ['sans video_id', {}, 400, 'video_id required'],
    ['video_id non texte', { video_id: ['x'] }, 400, 'video_id required'],
    ['vidéo inexistante', { video_id: 'f'.repeat(24) }, 404, 'Video not found'],
  ]) {
    const r = await fn('recordVideoView', { token: membre, body });
    check(`${label} -> ${status} { error: "${msg}" }`, r.status === status && r.data?.error === msg, `HTTP ${r.status}`);
  }
  const v = (await http('GET', '/api/collections/Video/records?perPage=1&fields=id,view_count,viewed_by,base44_updated_date', asSu)).data.items[0];
  if (!v) {
    check('vidéo disponible pour le test', false);
  } else {
    try {
      const viewed = Array.isArray(v.viewed_by) ? v.viewed_by : [];
      const before = Math.max(0, Math.floor(Number(v.view_count) || 0));
      const r1 = await fn('recordVideoView', { token: membre, body: { video_id: v.id, user_id: creds.admin.id } });
      if (viewed.includes(creds.membre.id)) {
        check('membre déjà compté -> { view_count, already_viewed: true }', r1.data?.already_viewed === true && r1.data.view_count === before);
      } else {
        check('membre, 1re vue -> 200 { view_count: avant + 1 }', r1.status === 200 && sameKeys(r1.data, ['view_count']) && r1.data.view_count === before + 1);
        const r2 = await fn('recordVideoView', { token: membre, body: { video_id: v.id } });
        check('membre, 2e vue -> { view_count inchangé, already_viewed: true }', sameKeys(r2.data, ['view_count', 'already_viewed']) && r2.data.already_viewed === true && r2.data.view_count === before + 1);
        const db = (await http('GET', `/api/collections/Video/records/${v.id}?fields=viewed_by`, asSu)).data;
        check('viewed_by contient l’id du membre authentifié', db.viewed_by.includes(creds.membre.id));
        check('id envoyé par le client ignoré (user_id du corps non utilisé)', !db.viewed_by.includes(creds.admin.id) || viewed.includes(creds.admin.id));
      }
      const r3 = await fn('recordVideoView', { token: admin, body: { video_id: v.id } });
      check('admin -> 200 (vue comptée ou déjà comptée)', r3.status === 200 && typeof r3.data?.view_count === 'number');
    } finally {
      await http('PATCH', `/api/collections/Video/records/${v.id}`, { ...asSu, body: { view_count: v.view_count, viewed_by: v.viewed_by, base44_updated_date: v.base44_updated_date } });
      const back = (await http('GET', `/api/collections/Video/records/${v.id}?fields=view_count,viewed_by`, asSu)).data;
      check('état initial restauré', back.view_count === v.view_count && JSON.stringify(back.viewed_by) === JSON.stringify(v.viewed_by));
    }
  }
}

console.log('\n■ Hooks de compatibilité (base44_*, valeurs par défaut, role)');
{
  let reactionId = null;
  let userId = null;
  try {
    const r = await http('POST', '/api/collections/PostReaction/records', {
      token: membre, body: { post_id: 'f'.repeat(24), user_id: creds.membre.id, created_by_id: creds.membre.id, base44_created_date: '2000-01-01 00:00:00.000Z' },
    });
    check('membre crée une PostReaction (règle créateur respectée)', r.status === 200, `HTTP ${r.status} ${keysOf(r.data?.data)}`);
    reactionId = r.data?.id;
    const rec = (await http('GET', `/api/collections/PostReaction/records/${reactionId}`, asSu)).data;
    check('défaut appliqué : type = "like"', rec.type === 'like');
    check('base44_created_date / base44_updated_date remplies', Boolean(rec.base44_created_date && rec.base44_updated_date));
    check('date de création imposée par un client ignorée', !rec.base44_created_date.startsWith('2000-'));
    await new Promise((ok) => setTimeout(ok, 20));
    // Depuis le bloc 3, les champs système (base44_*) sont verrouillés en mise à jour : la requête qui les envoie est refusée.
    const forged = await http('PATCH', `/api/collections/PostReaction/records/${reactionId}`, { token: membre, body: { type: 'like', base44_created_date: '2000-01-01 00:00:00.000Z' } });
    check('mise à jour avec base44_created_date imposée -> refusée', forged.status >= 400, `HTTP ${forged.status}`);
    const u = await http('PATCH', `/api/collections/PostReaction/records/${reactionId}`, { token: membre, body: { type: 'like' } });
    const rec2 = (await http('GET', `/api/collections/PostReaction/records/${reactionId}`, asSu)).data;
    check('mise à jour : base44_updated_date avance', u.status === 200 && rec2.base44_updated_date > rec.base44_updated_date, `HTTP ${u.status}`);
    check('mise à jour : base44_created_date inchangée', rec2.base44_created_date === rec.base44_created_date);

    const pwd = crypto.randomBytes(18).toString('base64url');
    const s = await http('POST', '/api/collections/users/records', {
      body: { email: `pilote-${crypto.randomBytes(6).toString('hex')}@chay.test`, password: pwd, passwordConfirm: pwd, name: 'Pilote' },
    });
    check('inscription publique sans role -> acceptée', s.status === 200, `HTTP ${s.status} ${keysOf(s.data?.data)}`);
    userId = s.data?.id;
    const nu = (await http('GET', `/api/collections/users/records/${userId}`, asSu)).data;
    check('users : role = "user" par défaut', nu.role === 'user');
    check('users : préférences booléennes par défaut (true) si absentes', nu.in_app_messages === true && nu.email_nouveautes === true);
    check('users : id de 24 hex', /^[a-f0-9]{24}$/.test(userId || ''));
    const esc = await http('POST', '/api/collections/users/records', {
      body: { email: `pilote-${crypto.randomBytes(6).toString('hex')}@chay.test`, password: pwd, passwordConfirm: pwd, role: 'admin' },
    });
    check('inscription avec role = "admin" -> refusée', esc.status >= 400);
  } finally {
    if (reactionId) await http('DELETE', `/api/collections/PostReaction/records/${reactionId}`, asSu);
    if (userId) await http('DELETE', `/api/collections/users/records/${userId}`, asSu);
  }
}

console.log(`\nRésultat : ${pass} réussis, ${fail} échoués${fail ? ` (${failures.join(' ; ')})` : ''}`);
process.exitCode = fail ? 1 : 0;
