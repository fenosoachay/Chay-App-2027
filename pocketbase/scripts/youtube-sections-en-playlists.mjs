#!/usr/bin/env node
// YouTube : les 3 anciennes sections (champ YouTubeVideo.section : culte, louange, celebration) deviennent de vraies
// playlists de premier niveau (Playlist.category = "youtube"), comme les autres rubriques du Multimédia.
//  - crée les playlists « Culte », « Louange », « Célébration » si elles n'existent pas (même nom, sans parent) ;
//  - relie chaque vidéo à la playlist de sa section (PlaylistTrack, mêmes champs que l'admin), dans l'ordre choisi
//    par l'admin pour la section (MediaOrder « youtube:<section> »), sinon de la plus récente à la plus ancienne ;
//  - une vidéo déjà reliée à une playlist YouTube n'est pas touchée. Relançable sans doublon. Rien n'est supprimé.
//
//   node pocketbase/scripts/youtube-sections-en-playlists.mjs              -> SIMULATION : plan, rien n'est écrit
//   node pocketbase/scripts/youtube-sections-en-playlists.mjs --appliquer  -> écrit
// Variables : PB_URL (http://127.0.0.1:8092 par le tunnel), PB_EMAIL et PB_PASSWORD d'un compte ADMIN de l'app
// (saisis masqués). Les mots de passe ne sont jamais affichés.
import { pathToFileURL } from 'node:url';

export const SECTIONS = [
  { id: 'culte', nom: 'Culte' },
  { id: 'louange', nom: 'Louange' },
  { id: 'celebration', nom: 'Célébration' },
];

const simple = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
/** Section d'une vidéo (vide ou inconnue -> culte, comme l'écran YouTube). */
export const sectionDe = (v) => (SECTIONS.some((s) => s.id === simple(v?.section)) ? simple(v.section) : 'culte');

/** Même ordre que l'écran : ordre de l'admin d'abord ; vidéos absentes de l'ordre en tête (plus récentes d'abord). */
export function ordonner(videos, ids) {
  const parDate = [...videos].sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  const rang = new Map((Array.isArray(ids) ? ids : []).map((id, i) => [id, i]));
  if (!rang.size) return parDate;
  return [...parDate.filter((v) => !rang.has(v.id)), ...parDate.filter((v) => rang.has(v.id)).sort((a, b) => rang.get(a.id) - rang.get(b.id))];
}

/** Lien PlaylistTrack d'une vidéo YouTube (mêmes champs que buildPlaylistTrackRecord de l'admin). */
export function lien(playlistId, v, order) {
  return {
    playlist_id: playlistId,
    track_id: v.id,
    title: v.title || '',
    artist: null,
    audio_url: null,
    video_url: null,
    cover_url: v.cover_url || v.thumbnail_url || (v.youtube_id ? `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` : null),
    kind: '',
    order,
  };
}

/**
 * Plan : { playlistsACreer: [section], liens: [{ section, video, order }], dejaRelies: n }.
 * `playlists` : playlists YouTube existantes ; `liensExistants` : PlaylistTrack de ces playlists.
 */
export function planifier({ videos, playlists, liensExistants, ordres }) {
  const racines = (playlists || []).filter((p) => p.category === 'youtube' && !p.parent_id);
  const idsYoutube = new Set((playlists || []).filter((p) => p.category === 'youtube').map((p) => p.id));
  const relies = new Set((liensExistants || []).filter((t) => idsYoutube.has(t.playlist_id)).map((t) => t.track_id));
  const playlistsACreer = [];
  const liens = [];
  let dejaRelies = 0;
  for (const s of SECTIONS) {
    const existe = racines.find((p) => simple(p.name) === simple(s.nom));
    if (!existe) playlistsACreer.push(s.id);
    const deLaSection = (videos || []).filter((v) => sectionDe(v) === s.id);
    const ordre = ordonner(deLaSection, ordres?.get?.(`youtube:${s.id}`));
    // `order` = place de la vidéo dans la section : une relance (après une coupure) garde le même ordre.
    ordre.forEach((v, i) => {
      if (relies.has(v.id)) { dejaRelies += 1; return; }
      liens.push({ section: s.id, video: v, order: i });
    });
  }
  return { playlistsACreer, liens, dejaRelies, racines };
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

async function creer(url, token, collection, data) {
  const r = await fetch(`${url}/api/collections/${collection}/records`, {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`${collection} : création refusée (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
  return r.json();
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
  const playlists = await toutLire(URL_PB, token, 'Playlist', "category = 'youtube'");
  const liensExistants = playlists.length
    ? await toutLire(URL_PB, token, 'PlaylistTrack', playlists.map((p) => `playlist_id = '${p.id}'`).join(' || '))
    : [];
  const ordres = new Map((await toutLire(URL_PB, token, 'MediaOrder', "key ~ 'youtube:'")).map((o) => [o.key, o.ids]));
  const plan = planifier({ videos, playlists, liensExistants, ordres });

  console.log(`Serveur : ${URL_PB} — ${videos.length} vidéo(s) YouTube, ${playlists.length} playlist(s) YouTube existante(s)`);
  for (const s of SECTIONS) {
    const n = plan.liens.filter((l) => l.section === s.id).length;
    console.log(`  ${s.nom} : ${plan.playlistsACreer.includes(s.id) ? 'playlist à créer' : 'playlist existante'} · ${n} vidéo(s) à relier`);
  }
  console.log(`Déjà reliées à une playlist YouTube (non touchées) : ${plan.dejaRelies}`);
  if (!appliquer) { console.log('Simulation : relancer avec --appliquer pour écrire.'); return; }

  const idPar = new Map();
  for (const s of SECTIONS) {
    const existe = plan.racines.find((p) => simple(p.name) === simple(s.nom));
    if (existe) { idPar.set(s.id, existe.id); continue; }
    const premiere = plan.liens.find((l) => l.section === s.id)?.video;
    const pl = await creer(URL_PB, token, 'Playlist', {
      name: s.nom, category: 'youtube', order: SECTIONS.indexOf(s),
      cover_url: premiere ? lien('', premiere, 0).cover_url || '' : '',
    });
    idPar.set(s.id, pl.id);
    console.log(`  ✓ playlist créée : ${s.nom}`);
  }
  let ok = 0;
  const echecs = [];
  for (const l of plan.liens) {
    await new Promise((r) => setTimeout(r, 800)); // le serveur limite le nombre de demandes par minute (429)
    try {
      await creer(URL_PB, token, 'PlaylistTrack', lien(idPar.get(l.section), l.video, l.order));
      ok += 1;
    } catch (e) {
      echecs.push(`${l.video.title || l.video.id} : ${e.message}`);
    }
  }
  for (const e of echecs) console.log(`  ✗ ${e}`);
  console.log(`Vidéos reliées : ${ok} · échecs : ${echecs.length}${echecs.length ? ' (relancer : les vidéos déjà reliées sont sautées)' : ''}`);
  if (echecs.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
