#!/usr/bin/env node
// 1.3.9 : rattache à leur playlist parente les « sous-playlists » créées pendant que Playlist.parent_id était caché
// (option « Hidden ») : elles ont été enregistrées comme des playlists de premier niveau. La parente voulue n'a
// jamais été enregistrée : c'est vous qui l'indiquez, dans un petit fichier JSON.
//
//   1. node pocketbase/scripts/reparer-sous-playlists.mjs --modele C:\Temp\rattachements.json
//        -> LECTURE SEULE : liste, par section, les playlists de premier niveau et écrit un modèle à compléter :
//           [{ "section": "music", "sous": "Nom de la sous-playlist", "parente": "" }, …]
//           (« parente » : nom de la playlist parente ; supprimer les lignes des vraies playlists de 1er niveau ;
//           en cas de noms en double dans une section, utiliser "sous_id" / "parente_id" à la place des noms)
//   2. node pocketbase/scripts/reparer-sous-playlists.mjs --fichier C:\Temp\rattachements.json
//        -> SIMULATION : chaque rattachement est vérifié (même section, parente de premier niveau, pas de 3e niveau) ;
//           rien n'est écrit
//   3. node pocketbase/scripts/reparer-sous-playlists.mjs --fichier C:\Temp\rattachements.json --appliquer
//        -> parent_id posé ; la sous-playlist est placée à la fin des sous-playlists de sa parente. Relançable.
// Variables : PB_URL (http://127.0.0.1:8092 : tunnel seulement), PB_EMAIL, PB_PASSWORD (SUPERUSER, saisis masqués).
// À lancer APRÈS migrer-1-3-9.mjs (parent_id visible) ; les contenus déjà liés à ces playlists restent liés.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const cat = (p) => p.category || 'music';

/**
 * Plan de rattachement : { operations: [{ sous, parente, order }], erreurs: [texte], dejaFaits: n }.
 * `playlists` : toutes les playlists ({ id, name, category, parent_id, order }) ; `demandes` : lignes du fichier.
 */
export function planRattachements(playlists, demandes) {
  const liste = Array.isArray(playlists) ? playlists : [];
  const parId = new Map(liste.map((p) => [p.id, p]));
  const erreurs = [];
  const operations = [];
  let dejaFaits = 0;
  const trouver = (ligne, champNom, champId, section, quoi) => {
    if (ligne[champId]) {
      const p = parId.get(ligne[champId]);
      if (!p) { erreurs.push(`${quoi} « ${ligne[champId]} » introuvable`); return null; }
      return p;
    }
    const nom = String(ligne[champNom] || '').trim();
    if (!nom) { erreurs.push(`${quoi} non indiquée (ligne ${JSON.stringify(ligne)})`); return null; }
    const candidats = liste.filter((p) => cat(p) === section && p.name === nom);
    if (!candidats.length) { erreurs.push(`${quoi} « ${nom} » introuvable dans la section ${section}`); return null; }
    if (candidats.length > 1) { erreurs.push(`${quoi} « ${nom} » : ${candidats.length} playlists portent ce nom dans ${section} ; utiliser ${champId}`); return null; }
    return candidats[0];
  };
  const prochainOrdre = new Map();
  const vus = new Set();
  for (const ligne of Array.isArray(demandes) ? demandes : []) {
    if (!ligne || typeof ligne !== 'object') { erreurs.push('ligne invalide'); continue; }
    const section = String(ligne.section || '').trim();
    if (!section && !ligne.sous_id) { erreurs.push(`section manquante (ligne ${JSON.stringify(ligne)})`); continue; }
    const sous = trouver(ligne, 'sous', 'sous_id', section, 'Sous-playlist');
    const parente = trouver(ligne, 'parente', 'parente_id', section || (sous && cat(sous)), 'Playlist parente');
    if (!sous || !parente) continue;
    const quoi = `« ${sous.name} » -> « ${parente.name} »`;
    if (vus.has(sous.id)) { erreurs.push(`${quoi} : sous-playlist indiquée deux fois`); continue; }
    vus.add(sous.id);
    if (sous.id === parente.id) { erreurs.push(`${quoi} : une playlist ne peut pas être sa propre sous-playlist`); continue; }
    if (cat(sous) !== cat(parente)) { erreurs.push(`${quoi} : sections différentes (${cat(sous)} / ${cat(parente)})`); continue; }
    if (parente.parent_id) { erreurs.push(`${quoi} : la parente est elle-même une sous-playlist (un seul niveau)`); continue; }
    if (sous.parent_id === parente.id) { dejaFaits++; continue; }
    if (sous.parent_id) { erreurs.push(`${quoi} : déjà rattachée à une autre playlist`); continue; }
    if (liste.some((p) => p.parent_id === sous.id) || operations.some((o) => o.parente.id === sous.id)) {
      erreurs.push(`${quoi} : « ${sous.name} » a elle-même des sous-playlists`); continue;
    }
    if (operations.some((o) => o.sous.id === parente.id)) { erreurs.push(`${quoi} : la parente est rattachée dans ce même fichier (un seul niveau)`); continue; }
    if (!prochainOrdre.has(parente.id)) {
      const ordres = liste.filter((p) => p.parent_id === parente.id).map((p) => Number(p.order) || 0);
      prochainOrdre.set(parente.id, ordres.length ? Math.max(...ordres) + 1 : 0);
    }
    const order = prochainOrdre.get(parente.id);
    prochainOrdre.set(parente.id, order + 1);
    operations.push({ sous, parente, order });
  }
  return { operations, erreurs, dejaFaits };
}

/** Modèle à compléter : une ligne par playlist de premier niveau sans sous-playlist, par section. */
export function modeleRattachements(playlists) {
  const liste = Array.isArray(playlists) ? playlists : [];
  return liste
    .filter((p) => !p.parent_id && !liste.some((s) => s.parent_id === p.id))
    .sort((a, b) => cat(a).localeCompare(cat(b)) || String(a.name).localeCompare(String(b.name), 'fr'))
    .map((p) => ({ section: cat(p), sous: p.name, parente: '' }));
}

async function main() {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const modele = val('--modele');
  const fichier = val('--fichier');
  const appliquer = args.includes('--appliquer');
  if (!modele && !fichier) throw new Error('indiquer --modele <fichier.json> (liste) ou --fichier <fichier.json> [--appliquer].');
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const hote = new URL(URL_PB).hostname;
  if (hote !== '127.0.0.1' && hote !== 'localhost') throw new Error('PB_URL doit viser le tunnel local (http://127.0.0.1:8092).');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  const playlists = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`${URL_PB}/api/collections/Playlist/records?perPage=500&page=${page}&fields=id,name,category,parent_id,order`, { headers: h });
    if (!r.ok) throw new Error(`lecture des playlists impossible (HTTP ${r.status})`);
    const d = await r.json();
    playlists.push(...d.items);
    if (page >= d.totalPages) break;
  }
  console.log(`Serveur : ${URL_PB} — ${playlists.length} playlist(s)`);

  if (modele) {
    const lignes = modeleRattachements(playlists);
    fs.writeFileSync(modele, `${JSON.stringify(lignes, null, 2)}\n`);
    for (const s of [...new Set(lignes.map((l) => l.section))]) {
      console.log(`  ${s} : ${lignes.filter((l) => l.section === s).map((l) => `« ${l.sous} »`).join(', ')}`);
    }
    console.log(`Modèle écrit : ${modele} (${lignes.length} playlist(s) de premier niveau sans sous-playlist). Compléter « parente », supprimer les lignes des vraies playlists, puis --fichier.`);
    return;
  }
  const demandes = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const plan = planRattachements(playlists, demandes);
  for (const o of plan.operations) console.log(`  ✓ ${cat(o.sous)} : « ${o.sous.name} » -> sous-playlist de « ${o.parente.name} »`);
  for (const e of plan.erreurs) console.log(`  ✗ ${e}`);
  console.log(`À rattacher : ${plan.operations.length} · déjà rattachées : ${plan.dejaFaits} · refusées : ${plan.erreurs.length}`);
  if (!appliquer) { console.log('Simulation : relancer avec --appliquer pour écrire.'); return; }
  if (plan.erreurs.length) throw new Error('corriger d’abord les lignes refusées (rien n’a été écrit).');
  let ok = 0;
  for (const o of plan.operations) {
    const r = await fetch(`${URL_PB}/api/collections/Playlist/records/${o.sous.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ parent_id: o.parente.id, order: o.order }) });
    if (r.ok) ok++;
    else console.log(`  ✗ « ${o.sous.name} » : HTTP ${r.status}`);
  }
  console.log(`Rattachées : ${ok} / ${plan.operations.length}`);
  if (ok !== plan.operations.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
