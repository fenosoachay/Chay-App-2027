/// <reference path="../pb_data/types.d.ts" />
// Ligne unique au démarrage, visible dans journalctl (stdout) et dans les journaux du tableau d'administration :
//   [chay] hooks chargés : N tâches planifiées (id, id, …), mode notifications = X
// N = tâches de NOS hooks (attendu : 4). Les tâches internes __pb… ne sont pas comptées.
// Aucune donnée personnelle : seulement des identifiants de tâches et le mode.
//
// PocketBase charge les fichiers pb_hooks dans un ordre NON déterminé (le préfixe « zz_ » ne garantit rien) :
// compter au chargement donnait parfois 2 au lieu de 4. Le comptage est donc fait au démarrage du serveur
// HTTP ($app.onServe()), quand tous les fichiers ont été exécutés. (Le JSVM n'a pas de fonction globale
// onServe ; on passe par le hook de l'application.)
// Si cette ligne manque, chercher « failed to execute » dans le journal : un fichier de hooks a échoué.

$app.onServe().bindFunc((e) => {
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
  return e.next();
});
