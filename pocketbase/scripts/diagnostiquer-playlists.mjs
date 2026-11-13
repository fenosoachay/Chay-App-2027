#!/usr/bin/env node
// Diagnostic des playlists et sous-playlists, en LECTURE SEULE (rien n'est écrit) : à lancer sur la prod par le
// tunnel SSH avec le superuser, pour confirmer la cause du « sélecteur de sous-playlist vide » (1.3.9).
//
//   node pocketbase/scripts/diagnostiquer-playlists.mjs
//
// Vérifie : présence du champ Playlist.parent_id ; valeurs du select Playlist.category (youtube, articles,
// gallery) ; règles de lecture ; par section : playlists de premier niveau, sous-playlists, sous-playlists
// orphelines ou d'une autre section ; liens PlaylistTrack vers une playlist de premier niveau (contenus qui ne
// s'affichent dans aucune sous-playlist).
// Variables : PB_URL (http://127.0.0.1:8092, tunnel seulement), PB_EMAIL, PB_PASSWORD (superuser, saisis masqués).
import { pathToFileURL } from 'node:url';

export const SECTIONS = ['music', 'sermons', 'youtube', 'articles', 'gallery'];

/** Analyse pure du schéma et des lignes : { problemes: [texte], parSection: {...} }. */
export function analyser(colPlaylist, playlists, liens) {
  const problemes = [];
  const champs = new Map((colPlaylist?.fields || []).map((f) => [f.name, f]));
  const avecParent = champs.has('parent_id');
  if (!avecParent) problemes.push('Champ Playlist.parent_id ABSENT : les sous-playlists sont enregistrées comme des playlists de premier niveau (cause du sélecteur vide). Appliquer migrer-playlists.mjs.');
  const valeurs = champs.get('category')?.values || [];
  const manquantes = ['youtube', 'articles', 'gallery'].filter((v) => !valeurs.includes(v));
  if (manquantes.length) problemes.push(`Playlist.category sans les valeurs ${manquantes.join(', ')} : création de playlists impossible dans ces sections. Appliquer migrer-playlists.mjs.`);
  if (colPlaylist && colPlaylist.listRule === null) problemes.push('Playlist.listRule = null : les playlists ne sont lisibles par personne depuis l’app.');
  const parId = new Map(playlists.map((p) => [p.id, p]));
  const cat = (p) => p.category || 'music';
  const parSection = {};
  for (const s of SECTIONS) {
    const ici = playlists.filter((p) => cat(p) === s);
    const racines = ici.filter((p) => !p.parent_id);
    const sous = ici.filter((p) => p.parent_id);
    const orphelines = sous.filter((p) => !parId.has(p.parent_id) || parId.get(p.parent_id).parent_id || cat(parId.get(p.parent_id)) !== s);
    const idsRacines = new Set(racines.map((p) => p.id));
    const liensRacines = liens.filter((l) => idsRacines.has(l.playlist_id)).length;
    parSection[s] = { racines: racines.length, sous: sous.length, orphelines: orphelines.length, liensVersRacines: liensRacines };
    if (racines.length && !sous.length) problemes.push(`${s} : ${racines.length} playlist(s) mais aucune sous-playlist : sélecteur vide dans cette section.`);
    if (orphelines.length) problemes.push(`${s} : ${orphelines.length} sous-playlist(s) orpheline(s) (parente absente, imbriquée ou d’une autre section).`);
  }
  return { avecParent, problemes, parSection };
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const h0 = new URL(URL_PB).hostname;
  if (h0 !== '127.0.0.1' && h0 !== 'localhost') throw new Error('PB_URL doit viser le tunnel local (http://127.0.0.1:8092).');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token };
  const lire = async (chemin) => {
    const r = await fetch(`${URL_PB}${chemin}`, { headers: h });
    if (!r.ok) throw new Error(`lecture ${chemin} impossible (HTTP ${r.status})`);
    return r.json();
  };
  const tout = async (col, champs) => {
    const out = [];
    for (let page = 1; page < 100; page++) {
      const d = await lire(`/api/collections/${col}/records?perPage=500&page=${page}&fields=${champs}`);
      out.push(...d.items);
      if (page >= d.totalPages) break;
    }
    return out;
  };
  const col = await lire('/api/collections/Playlist');
  const playlists = await tout('Playlist', 'id,name,category,parent_id');
  const liens = await tout('PlaylistTrack', 'id,playlist_id');
  const a = analyser(col, playlists, liens);
  console.log(`Serveur : ${URL_PB} — ${playlists.length} playlist(s), ${liens.length} lien(s) PlaylistTrack`);
  console.log(`Champ parent_id : ${a.avecParent ? 'présent' : 'ABSENT'} ; category : ${(col.fields.find((f) => f.name === 'category')?.values || []).join(', ')}`);
  console.log(`Règles Playlist : lecture « ${col.listRule} », création « ${col.createRule} »`);
  for (const [s, v] of Object.entries(a.parSection)) console.log(`  ${s.padEnd(9)} : ${v.racines} playlist(s), ${v.sous} sous-playlist(s), ${v.orphelines} orpheline(s), ${v.liensVersRacines} lien(s) vers une playlist de 1er niveau`);
  console.log(a.problemes.length ? `\nProblèmes :\n${a.problemes.map((p) => `  ✗ ${p}`).join('\n')}` : '\nAucun problème détecté.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
