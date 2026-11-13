// Requêtes › « Se missionner » (lot E) : POST /api/fn/createMissionRequest (membre connecté).
// Enregistrement dans MissionRequest (visible dans le panneau admin) puis e-mail à chaque admin actif.
// Limite : 5 demandes par membre et par 24 h. Le demandeur est imposé par le serveur.

routerAdd('POST', '/api/fn/createMissionRequest', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createMissionRequest', 'Erreur interne', () => {
    const missions = require(`${__hooks}/lib/missions.js`);
    const mail = require(`${__hooks}/lib/courriel.js`);
    const caller = fn.requireUser(e, 'Connexion requise.');
    const v = missions.validerMission(fn.readBody(e));
    if (v.erreur) throw new fn.HttpError(400, v.erreur);
    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ');
    const rec = fn.tx((txApp) => {
      const recentes = txApp.findRecordsByFilter('MissionRequest', 'user_id = {:u} && created >= {:depuis}', '', missions.LIMITE_PAR_JOUR, 0,
        { u: caller.id, depuis });
      if (recentes.length >= missions.LIMITE_PAR_JOUR) {
        return fn.fail(429, `Limite atteinte : ${missions.LIMITE_PAR_JOUR} demandes par jour.`, { limit_reached: true });
      }
      const r = fn.newRecord(txApp, 'MissionRequest', Object.assign({ user_id: caller.id, status: 'nouvelle', created_by_id: caller.id }, v.data));
      txApp.save(r);
      return fn.ok(r);
    });
    const admins = $app.findRecordsByFilter('users', "role = 'admin' && disabled != true", '', 0, 0);
    const c = missions.courrielMission(mail, v.data, `${mail.appUrl()}/admin/missions`);
    let envoyes = 0;
    for (const a of admins) {
      if (a.email() && mail.trySend('createMissionRequest', a.email(), c.sujet, c.html, c.texte)) envoyes++;
    }
    return { id: rec.id, admins_prevenus: envoyes };
  });
});
