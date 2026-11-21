// Petite Histoire du verset du jour (1.3.22) : le membre a touché « Vu / Entendu / Lu » (ou « OK » quand il n'y a
// pas d'histoire) -> elle ne revient plus pour ce verset, sur tous ses appareils.
//  - POST /api/fn/histoireVue { devotional_id } : ajoute l'identifiant à users.histoires_vues (500 derniers gardés).
// Champs : pocketbase/scripts/migrer-1-3-22.mjs.

routerAdd('POST', '/api/fn/histoireVue', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'histoireVue', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const body = fn.readBody(e);
    const id = typeof body.devotional_id === 'string' ? body.devotional_id.trim() : '';
    if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new fn.HttpError(400, 'devotional_id invalide');
    const user = fn.findById('users', caller.id);
    if (!user) throw new fn.HttpError(404, 'Compte introuvable');
    let vues = [];
    try {
      const brut = fn.plain(user).histoires_vues;
      vues = Array.isArray(brut) ? brut.filter((v) => typeof v === 'string') : [];
    } catch (_) {
      vues = [];
    }
    if (vues.indexOf(id) === -1) {
      vues.push(id);
      if (vues.length > 500) vues = vues.slice(vues.length - 500);
      user.set('histoires_vues', vues);
      $app.save(user);
    }
    return { histoires_vues: vues };
  });
});
