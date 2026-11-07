#!/usr/bin/env node
// Tâche fichiers_orphelins et variable FICHIERS_NETTOYAGE, contre le BAC À SABLE LOCAL.
//   node pocketbase/tests/fn-nettoyage-fichiers.integration.mjs <simulation|actif>
// PocketBase doit avoir été lancé sans FICHIERS_NETTOYAGE (ou avec une valeur invalide) pour « simulation »,
// avec FICHIERS_NETTOYAGE=actif pour « actif ». Vérifie le journal de la tâche (nombres seulement).
// En « actif », refuse de lancer la tâche si le bac à sable contient des fichiers réellement orphelins.
import { http, loadCreds, login, makeChecker, q, sleep } from './lib.mjs';

const MODE = process.argv[2];
if (!['simulation', 'actif'].includes(MODE)) { console.error('usage : fn-nettoyage-fichiers.integration.mjs <simulation|actif>'); process.exit(2); }
const creds = loadCreds(['superuser']);
const { check, done } = makeChecker();
const su = { token: (await login('_superusers', creds.superuser)).token };

// Fichiers concernés aujourd'hui (route en simulation : ne supprime rien).
const sim = await http('POST', '/api/fn/cleanupOrphanFiles', { ...su, body: { simulation: true } });
check('route cleanupOrphanFiles en simulation (rien supprimé)', sim.status === 200 && sim.data.simulation === true && sim.data.supprimes === 0);
const orphans = sim.data?.orphelins ?? -1;
console.log(`fichiers orphelins de plus de 7 jours dans le bac à sable : ${orphans}`);
if (MODE === 'actif' && orphans !== 0) {
  console.error('ARRÊT : le bac à sable contient des orphelins ; la tâche en mode actif les supprimerait.');
  process.exit(2);
}

const since = new Date(Date.now() - 1000).toISOString().replace('T', ' ');
const cron = await http('POST', '/api/crons/fichiers_orphelins', su);
let log = null;
for (let i = 0; i < 40 && !log; i++) {
  await sleep(500);
  const items = (await http('GET', `/api/logs?perPage=20&filter=${q(`message = "[fichiers] fichiers non référencés" && created >= "${since}"`)}`, su)).data?.items || [];
  log = items[0] || null;
}
check('tâche lancée (204) et journalisée', cron.status === 204 && Boolean(log));
check(`mode journalisé : ${MODE}`, log?.data?.mode === MODE, `mode=${log?.data?.mode}`);
check('journal : nombres seulement', log && ['examines', 'orphelins', 'supprimes'].every((k) => typeof log.data[k] === 'number'));
if (MODE === 'simulation') check('simulation : aucun fichier supprimé, nombre de fichiers concernés journalisé', log?.data?.supprimes === 0 && log?.data?.orphelins === orphans);
else check('actif : suppression réelle permise (0 orphelin ici, donc 0 supprimé)', log?.data?.supprimes === 0);
done();
