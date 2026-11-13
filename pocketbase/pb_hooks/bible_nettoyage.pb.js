// 1.3.8 : suppression d'un livre RETIRÉ de « Sagesse en audio » (les Psaumes) : fiches BibleAudio ET objets R2.
// SUPERUSER seulement (par le tunnel SSH ; jamais un admin de l'app). Les clés R2 restent sur le serveur.
//
//  POST /api/fn/nettoyerBibleAudio { livre: "psaumes" }
//       -> SIMULATION : { fiches, objets, octets, fichesHorsRangement, clesSansObjet, objetsSansFiche, exemples }
//  POST /api/fn/nettoyerBibleAudio { livre: "psaumes", appliquer: true, attendu: { fiches: N, objets: M } }
//       -> suppression, refusée (409) si N ou M ne correspondent plus à l'état actuel (nouvelle simulation).
// Ordre : objets R2 d'abord (vérifiés : 204 / 404), puis chaque fiche dont l'objet a bien disparu. Relançable :
// un second appel ne trouve plus rien. Une adresse hors de <préfixe>/bible/<livre>/ n'est jamais supprimée sur R2.

routerAdd('POST', '/api/fn/nettoyerBibleAudio', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'nettoyerBibleAudio', 'Nettoyage impossible', () => {
    if (!e.hasSuperuserAuth()) throw new fn.HttpError(403, 'Réservé au superuser');
    const lib = require(`${__hooks}/lib/televersement.js`);
    const n = require(`${__hooks}/lib/nettoyageBible.js`);
    const body = fn.readBody(e);
    const livre = typeof body.livre === 'string' ? body.livre : '';
    if (n.LIVRES_RETIRES.indexOf(livre) < 0) throw new fn.HttpError(400, `livre non retiré : seuls ${n.LIVRES_RETIRES.join(', ')} peuvent être nettoyés`);
    const cfg = lib.requireR2();
    const prefixe = n.prefixeLivre(cfg.prefix, livre);
    const fiches = $app.findRecordsByFilter('BibleAudio', 'book = {:l}', 'chapter', 0, 0, { l: livre })
      .map((r) => ({ id: r.id, chapter: r.getInt('chapter'), audio_url: r.getString('audio_url') }));
    const objets = lib.listObjects(cfg, prefixe);
    const plan = n.planNettoyage(fiches, objets, cfg.publicBaseUrl, prefixe);
    const resume = {
      livre, prefixe, fiches: plan.fiches.length, objets: plan.objets.length, octets: plan.octets,
      fichesHorsRangement: plan.fichesHorsRangement, clesSansObjet: plan.clesSansObjet, objetsSansFiche: plan.objetsSansFiche,
      exemples: plan.objets.slice(0, 5).map((o) => o.key),
    };
    if (body.appliquer !== true) return Object.assign({ simulation: true }, resume);

    const attendu = body.attendu || {};
    if (Number(attendu.fiches) !== plan.fiches.length || Number(attendu.objets) !== plan.objets.length) {
      throw new fn.HttpError(409, `L'état a changé (${plan.fiches.length} fiches, ${plan.objets.length} objets) : refaire la simulation.`, resume);
    }
    const erreurs = [];
    const echouees = {};
    let objetsSupprimes = 0;
    for (const o of plan.objets) {
      try {
        lib.supprimerObjet(cfg, o.key);
        objetsSupprimes++;
      } catch (err) {
        echouees[o.key] = true;
        erreurs.push({ cle: o.key, erreur: String(err.message || err).slice(0, 200) });
      }
    }
    let fichesSupprimees = 0;
    for (const f of plan.fiches) {
      if (f.cle && echouees[f.cle]) continue; // objet encore là : la fiche reste, pour un nouvel essai
      try {
        $app.delete($app.findRecordById('BibleAudio', f.id));
        fichesSupprimees++;
      } catch (err) {
        erreurs.push({ fiche: f.id, erreur: String(err.message || err).slice(0, 200) });
      }
    }
    $app.logger().info('[nettoyerBibleAudio] livre nettoyé', 'livre', livre, 'fiches', fichesSupprimees, 'objets', objetsSupprimes, 'erreurs', erreurs.length);
    return Object.assign(resume, { simulation: false, fichesSupprimees, objetsSupprimes, erreurs });
  });
});
