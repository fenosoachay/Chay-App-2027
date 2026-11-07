#!/usr/bin/env node
// Ligne de démarrage « [chay] hooks chargés » (pb_hooks/zz_demarrage.pb.js), sur des PocketBase JETABLES
// (pb-jetable.mjs : superuser créé avant le démarrage, aucun onglet de navigateur, jamais 8090/8092).
// PocketBase charge les fichiers de hooks dans un ordre non déterminé : on démarre plusieurs fois et la ligne
// doit TOUJOURS annoncer les 4 tâches, une seule fois.
//   node pocketbase/tests/demarrage.integration.mjs [nombre de démarrages, défaut 5]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeChecker } from './lib.mjs';
import { demarrerJetable } from './pb-jetable.mjs';

const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pb_hooks');
const N = Number(process.argv[2]) || 5;
const ATTENDU = 'fichiers_orphelins, push_reessais, televersements_incomplets, verset_du_jour';
const { check, done } = makeChecker();

for (const [i, mode] of Array.from({ length: N }, (_, k) => [k, ['off', 'test', 'on', 'nimporte', ''][k % 5]])) {
  const pb = await demarrerJetable({ hooksDir: HOOKS, env: { NOTIFICATIONS_MODE: mode } });
  try {
    await new Promise((ok) => setTimeout(ok, 300));
    const lignes = pb.sortie().split(/\r?\n/).filter((l) => l.includes('[chay] hooks chargés :'));
    const attenduMode = ['test', 'on'].includes(mode) ? mode : 'off';
    check(`démarrage ${i + 1} (mode « ${mode || 'absent'} ») : une ligne, 4 tâches, mode ${attenduMode}`,
      lignes.length === 1 && lignes[0].includes(`: 4 tâches planifiées (${ATTENDU}), mode notifications = ${attenduMode}`), lignes.join(' | '));
    check(`démarrage ${i + 1} : aucun lien d'installation, aucune erreur de hook`, !/pbinstall|failed to execute/i.test(pb.sortie()));
  } finally {
    await pb.stop();
  }
}
done();
