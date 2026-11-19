#!/usr/bin/env node
// YouTube : remplace dans YouTubeVideo.youtube_id un lien complet (watch?v=, youtu.be/, live/, shorts/…) par le seul
// identifiant à 11 caractères, et corrige la miniature des liens de playlist (PlaylistTrack.cover_url) bâtie sur
// l'ancienne valeur. Les valeurs illisibles sont seulement signalées (à corriger à la main dans l'admin).
//
//   node pocketbase/scripts/normaliser-youtube-ids.mjs              -> SIMULATION : liste, rien n'est écrit
//   node pocketbase/scripts/normaliser-youtube-ids.mjs --appliquer  -> écrit
// Variables : PB_URL (http://127.0.0.1:8092 par le tunnel), PB_EMAIL et PB_PASSWORD d'un compte ADMIN de l'app.
import { pathToFileURL } from 'node:url';
import { idYoutube } from '../../src/lib/youtubeEmbed.js';

/** Plan : { aCorriger: [{ video, nouvel }], illisibles: [video], bons: n }. */
export function planifier(videos) {
  const aCorriger = [];
  const illisibles = [];
  let bons = 0;
  for (const v of videos || []) {
    const brut = String(v.youtube_id || '');
    const id = idYoutube(brut);
    if (!id) illisibles.push(v);
    else if (id !== brut) aCorriger.push({ video: v, nouvel: id });
    else bons += 1;
  }
  return { aCorriger, illisibles, bons };
}

async function toutLire(url, token, collection, filtre = '') {
  const out = [];
  for (let page = 1; page < 100; page += 1) {
    const q = `perPage=500&page=${page}${filtre ? `&filter=${encodeURIComponent(filtre)}` : ''}`;
    const r = await fetch(`${url}/api/collections/${collection}/records?${q}`, { headers: { Authorization: token } });
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const j = await r.json();
    out.push(...(j.items || []));
    if (page >= (j.totalPages || 1)) break;
  }
  return out;
}

async function modifier(url, token, collection, id, data) {
  await new Promise((r) => setTimeout(r, 800)); // le serveur limite le nombre de demandes par minute (429)
  const r = await fetch(`${url}/api/collections/${collection}/records/${id}`, {
    method: 'PATCH', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`${collection} : modification refusée (HTTP ${r.status}) ${(await r.text()).slice(0, 200)}`);
}

async function main() {
  const appliquer = process.argv.includes('--appliquer');
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (compte admin de l’app) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/users/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion refusée (HTTP ${auth.status})`);
  const { token, record } = await auth.json();
  if (record?.role !== 'admin') throw new Error('ce compte n’est pas admin.');

  const videos = await toutLire(URL_PB, token, 'YouTubeVideo');
  const plan = planifier(videos);
  console.log(`Serveur : ${URL_PB} — ${videos.length} vidéo(s) YouTube · correctes : ${plan.bons}`);
  for (const c of plan.aCorriger) console.log(`  ~ ${c.video.title || c.video.id} : « ${String(c.video.youtube_id).slice(0, 70)} » -> ${c.nouvel}`);
  for (const v of plan.illisibles) console.log(`  ✗ ${v.title || v.id} : « ${String(v.youtube_id || '').slice(0, 70)} » (illisible : à corriger dans l'admin)`);
  console.log(`À corriger : ${plan.aCorriger.length} · illisibles : ${plan.illisibles.length}`);
  if (!appliquer) { console.log('Simulation : relancer avec --appliquer pour écrire.'); return; }

  let ok = 0;
  const echecs = [];
  for (const c of plan.aCorriger) {
    try {
      await modifier(URL_PB, token, 'YouTubeVideo', c.video.id, { youtube_id: c.nouvel });
      const liens = await toutLire(URL_PB, token, 'PlaylistTrack', `track_id = '${c.video.id}'`);
      for (const l of liens) {
        if (String(l.cover_url || '').includes('img.youtube.com/vi/') && !String(l.cover_url).includes(`/vi/${c.nouvel}/`)) {
          await modifier(URL_PB, token, 'PlaylistTrack', l.id, { cover_url: `https://img.youtube.com/vi/${c.nouvel}/hqdefault.jpg` });
        }
      }
      ok += 1;
    } catch (e) {
      echecs.push(`${c.video.title || c.video.id} : ${e.message}`);
    }
  }
  for (const e of echecs) console.log(`  ✗ ${e}`);
  console.log(`Corrigées : ${ok} · échecs : ${echecs.length}${echecs.length ? ' (relancer : les vidéos déjà corrigées sont sautées)' : ''}`);
  if (echecs.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
