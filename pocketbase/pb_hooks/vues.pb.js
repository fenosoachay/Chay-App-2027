// Compteur de vues du multimédia (lot E) : POST /api/fn/compterVue { type, id } (membre connecté).
// L'app n'appelle cette route qu'à la moitié d'une lecture audio / vidéo, ou après 2 minutes de lecture d'un
// article ; ici, une seconde vue du même membre sur le même contenu dans les 30 minutes n'est pas comptée.
// Réponse : { view_count, compte } (compte = false si la vue a été ignorée). Règles : lib/vues.js.

routerAdd('POST', '/api/fn/compterVue', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'compterVue', 'Vue non enregistrée', () => {
    const vues = require(`${__hooks}/lib/vues.js`);
    const user = fn.requireUser(e, 'Connexion requise.');
    const d = vues.lireDemande(fn.readBody(e));
    if (d.erreur) throw new fn.HttpError(400, d.erreur);
    const iso = (ms) => new Date(ms).toISOString().replace('T', ' ');
    const maintenant = Date.now();
    return fn.tx((txApp) => {
      let lignes = [];
      if (d.cible.parChamp) {
        lignes = txApp.findRecordsByFilter(d.cible.collection, `${d.cible.parChamp} = {:id}`, '', 200, 0, { id: d.id });
      } else {
        try { lignes = [txApp.findRecordById(d.cible.collection, d.id)]; } catch (_) { lignes = []; }
      }
      if (!lignes.length) return fn.fail(404, 'contenu introuvable');
      const actuel = lignes.reduce((m, r) => Math.max(m, vues.entier(r.get(d.cible.champ))), 0);
      const recente = txApp.findRecordsByFilter('MediaVue', 'user_id = {:u} && cle = {:c} && created >= {:depuis}', '', 1, 0,
        { u: user.id, c: d.cle, depuis: iso(maintenant - vues.FENETRE_MS) });
      if (recente.length) return fn.ok({ view_count: actuel, compte: false });
      for (const r of lignes) {
        r.set(d.cible.champ, vues.entier(r.get(d.cible.champ)) + 1);
        txApp.save(r);
      }
      txApp.save(fn.newRecord(txApp, 'MediaVue', { user_id: user.id, cle: d.cle }));
      // Purge au fil de l'eau : le journal ne garde que les dernières 24 h de ce membre.
      for (const vieux of txApp.findRecordsByFilter('MediaVue', 'user_id = {:u} && created < {:avant}', '', 100, 0,
        { u: user.id, avant: iso(maintenant - vues.PURGE_MS) })) txApp.delete(vieux);
      return fn.ok({ view_count: actuel + 1, compte: true });
    });
  });
});
