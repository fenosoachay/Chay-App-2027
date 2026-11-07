/// <reference path="../pb_data/types.d.ts" />
// Ligne unique au démarrage, visible dans journalctl (stdout) et dans les journaux du tableau d'administration :
//   [chay] hooks chargés : N tâches planifiées (id, id, …), mode notifications = X
// N = tâches de NOS hooks (attendu : 4). Les tâches internes __pb… ne sont pas comptées :
// une partie n'est enregistrée qu'après le chargement des hooks (voir GET /api/crons).
// Aucune donnée personnelle : seulement des identifiants de tâches et le mode.
// Code de premier niveau, exécuté une fois au chargement. Le nom « zz_ » le fait passer en DERNIER
// (fichiers chargés par ordre alphabétique) : tous les cronAdd des autres fichiers sont déjà enregistrés.
// (Le JSVM n'expose pas onServe, et un onBootstrap déclaré ici ne serait jamais appelé :
// les hooks sont chargés pendant le bootstrap.)
// Si cette ligne manque au démarrage, chercher « failed to execute » dans le journal : un fichier de hooks a échoué.

(() => {
  try {
    const jobs = $app.cron().jobs() || [];
    const ids = [];
    for (let i = 0; i < jobs.length; i++) if (jobs[i]) ids.push(String(jobs[i].id()));
    const hooks = ids.filter((id) => !id.startsWith('__pb')).sort();
    const mode = require(`${__hooks}/lib/sortie.js`).mode();
    console.log(`[chay] hooks chargés : ${hooks.length} tâches planifiées (${hooks.join(', ') || 'aucune'}), mode notifications = ${mode}`);
    $app.logger().info('[chay] hooks chargés', 'taches', hooks.length, 'ids', hooks.join(','), 'modeNotifications', mode);
  } catch (err) {
    console.log(`[chay] hooks chargés : comptage des tâches impossible (${err})`);
  }
})();
