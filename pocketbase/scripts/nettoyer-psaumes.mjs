#!/usr/bin/env node
// 1.3.8 : suppression des Psaumes de « Sagesse en audio » — fiches BibleAudio (book = psaumes) ET objets R2 sous
// videos/bible/psaumes/. Le travail est fait par la route SUPERUSER POST /api/fn/nettoyerBibleAudio (les clés R2
// restent sur le serveur) ; ce script l'appelle par le tunnel SSH et garde une sauvegarde locale des fiches.
//
//   node pocketbase/scripts/nettoyer-psaumes.mjs                          -> SIMULATION : nombres, exemples ; rien supprimé
//   node pocketbase/scripts/nettoyer-psaumes.mjs --appliquer --confirmer 146
//        -> sauvegarde des fiches (JSON), puis suppression ; refusé si 146 n'est plus le nombre de fiches trouvé.
// Options : --sauvegarde <fichier> (défaut C:\Temp\bible-psaumes-sauvegarde.json).
// Variables : PB_URL (http://127.0.0.1:8092 : tunnel seulement, toute autre machine est refusée), PB_EMAIL et
// PB_PASSWORD du SUPERUSER (saisis masqués, voir docs/1.3.8.md). Les identifiants ne sont jamais affichés.
// Code de sortie : 0 si tout va bien, 2 si des suppressions ont échoué (relancer : seul le reste est traité).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function lireArgs(argv) {
  const a = { appliquer: false, confirmer: null, sauvegarde: 'C:\\Temp\\bible-psaumes-sauvegarde.json' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--appliquer') a.appliquer = true;
    else if (k === '--confirmer') a.confirmer = Number(argv[++i]);
    else if (k === '--sauvegarde') a.sauvegarde = argv[++i];
    else throw new Error(`option inconnue : ${k}`);
  }
  if (a.appliquer && !Number.isInteger(a.confirmer)) throw new Error('--appliquer exige --confirmer <nombre de fiches validé lors de la simulation>.');
  if (!a.sauvegarde) throw new Error('--sauvegarde : chemin attendu.');
  return a;
}

/** Seules les adresses locales (tunnel SSH) sont acceptées. */
export function urlAutorisee(u) {
  try {
    const h = new URL(u).hostname;
    return h === '127.0.0.1' || h === 'localhost';
  } catch {
    return false;
  }
}

const mo = (n) => `${(n / (1024 * 1024)).toFixed(1)} Mo`;

export function resumeTexte(r) {
  return [
    `Livre : ${r.livre} — préfixe R2 : ${r.prefixe}`,
    `Fiches BibleAudio à supprimer : ${r.fiches}`,
    `Objets R2 à supprimer : ${r.objets} (${mo(r.octets)})`,
    `  dont objets sans fiche (anciens fichiers remplacés) : ${r.objetsSansFiche}`,
    `Fiches dont l'objet est déjà absent de R2 : ${r.clesSansObjet}`,
    `Fiches pointant hors de ${r.prefixe} (fiche supprimée, fichier laissé tel quel) : ${r.fichesHorsRangement}`,
    ...(r.exemples?.length ? ['Exemples :', ...r.exemples.map((k) => `  ${k}`)] : []),
  ].join('\n');
}

async function main() {
  const args = lireArgs(process.argv.slice(2));
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  if (!urlAutorisee(URL_PB)) throw new Error('PB_URL doit viser le tunnel local (http://127.0.0.1:8092).');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  const appel = async (corps) => {
    const r = await fetch(`${URL_PB}/api/fn/nettoyerBibleAudio`, { method: 'POST', headers: h, body: JSON.stringify(corps) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 404 && !d.error) throw new Error('route nettoyerBibleAudio absente : déployer d’abord les hooks de la 1.3.8.');
    if (!r.ok) throw new Error(`HTTP ${r.status} : ${typeof d.error === 'string' ? d.error : JSON.stringify(d).slice(0, 200)}`);
    return d;
  };

  console.log(`Serveur : ${URL_PB}`);
  const sim = await appel({ livre: 'psaumes' });
  console.log(resumeTexte(sim));
  if (!args.appliquer) {
    console.log(`\nSimulation : rien n'a été supprimé. Pour supprimer : --appliquer --confirmer ${sim.fiches}`);
    return;
  }
  if (args.confirmer !== sim.fiches) {
    throw new Error(`refusé : ${sim.fiches} fiche(s) trouvée(s), ${args.confirmer} confirmée(s). Refaire la simulation et vérifier.`);
  }

  // Sauvegarde locale des fiches AVANT toute suppression (id, chapitre, adresse, taille, durée).
  const fiches = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`${URL_PB}/api/collections/BibleAudio/records?perPage=500&page=${page}&sort=chapter&filter=${encodeURIComponent("book = 'psaumes'")}`, { headers: h });
    if (!r.ok) throw new Error(`sauvegarde impossible (HTTP ${r.status}) : rien n'a été supprimé.`);
    const d = await r.json();
    fiches.push(...(d.items || []).map(({ id, book, chapter, audio_url, size, duration, created }) => ({ id, book, chapter, audio_url, size, duration, created })));
    if (page >= (d.totalPages || 1)) break;
  }
  fs.mkdirSync(path.dirname(args.sauvegarde), { recursive: true });
  fs.writeFileSync(args.sauvegarde, `${JSON.stringify({ date: new Date().toISOString(), serveur: URL_PB, fiches }, null, 2)}\n`);
  console.log(`\nSauvegarde : ${args.sauvegarde} (${fiches.length} fiche(s))`);

  const r = await appel({ livre: 'psaumes', appliquer: true, attendu: { fiches: sim.fiches, objets: sim.objets } });
  console.log(`Supprimé : ${r.fichesSupprimees} fiche(s), ${r.objetsSupprimes} objet(s) R2 ; erreurs : ${r.erreurs.length}`);
  for (const x of r.erreurs.slice(0, 20)) console.log(`  ✗ ${x.cle || x.fiche} : ${x.erreur}`);
  if (r.erreurs.length) {
    console.log('Relancer la simulation puis la même commande avec le nouveau nombre : seul le reste sera traité.');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
