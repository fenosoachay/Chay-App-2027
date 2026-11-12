/// <reference path="../pb_data/types.d.ts" />
// Réunions : archivage automatique une fois l'heure passée (lib/reunions.js).

// Toutes les 5 minutes : une réunion disparaît pour les membres au plus 5 minutes après son heure.
cronAdd('reunions_archivage', '*/5 * * * *', () => {
  try {
    const r = require(`${__hooks}/lib/reunions.js`).archiverReunions(Date.now());
    if (r.archivees) $app.logger().info('[reunions_archivage]', 'archivees', r.archivees);
  } catch (_) {
    $app.logger().error('[reunions_archivage] échec');
  }
});

// Admin : lancer l'archivage tout de suite (tests, vérification après déploiement).
routerAdd('POST', '/api/fn/archiverReunions', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'archiverReunions', 'Erreur interne', () => {
    fn.requireAdmin(e, 'Forbidden');
    return require(`${__hooks}/lib/reunions.js`).archiverReunions(Date.now());
  });
});
