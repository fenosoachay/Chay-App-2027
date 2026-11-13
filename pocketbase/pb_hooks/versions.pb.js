// Annonce d'une nouvelle version de l'APK (lot E) : e-mail à tous les membres et push aux appareils, déclenchée
// par un admin depuis le panneau (Équipe › Annoncer une mise à jour), avec confirmation et une seule fois par version.
//
//  POST /api/fn/annoncerVersion { version_name, version_code }                      -> aperçu (rien n'est envoyé) :
//       { destinataires (e-mails), appareils (push), deja: null | { date } }
//  POST /api/fn/annoncerVersion { version_name, version_code, confirmer: true, attendu: N } -> envoi :
//       refus 409 si la version est déjà annoncée, ou si le nombre de destinataires n'est plus N (nouvel aperçu).
// Push : tout de suite (service d'envoi groupé). E-mails : par lots, tâche « annonce_version » chaque minute.
// Règles et textes : lib/annonceVersion.js.

routerAdd('POST', '/api/fn/annoncerVersion', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'annoncerVersion', 'Annonce impossible', () => {
    const lib = require(`${__hooks}/lib/annonceVersion.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    const push = require(`${__hooks}/lib/push.js`);
    const admin = fn.requireAdmin(e, 'Réservé aux administrateurs.');
    const body = fn.readBody(e);
    const v = lib.validerVersion(body);
    if (v.erreur) throw new fn.HttpError(400, v.erreur);

    const trouver = () => {
      try { return $app.findFirstRecordByFilter('VersionAnnonce', 'version_code = {:c}', { c: v.version_code }); } catch (_) { return null; }
    };
    const deja = trouver();
    const emails = [];
    const pushIds = [];
    for (const u of $app.findRecordsByFilter('users', 'disabled != true', '', 0, 0)) {
      const c = lib.canaux(notif.settingsOf(u));
      if (c.email && u.email()) emails.push(u.id);
      if (c.push) pushIds.push(u.id);
    }
    const cibles = push.collectTargets(pushIds);
    const appareils = cibles.fcm.length + cibles.web.length;
    const infoDeja = deja ? { date: deja.getString('created'), version_name: deja.getString('version_name') } : null;

    if (body.confirmer !== true) {
      return { version_name: v.version_name, version_code: v.version_code, destinataires: emails.length, appareils, deja: infoDeja };
    }
    if (deja) throw new fn.HttpError(409, `La version ${deja.getString('version_name')} (code ${v.version_code}) a déjà été annoncée.`, { deja: infoDeja });
    if (Number(body.attendu) !== emails.length) {
      throw new fn.HttpError(409, `Le nombre de destinataires a changé (${emails.length}). Confirmez de nouveau.`, { destinataires: emails.length, appareils });
    }

    const rec = fn.newRecord($app, 'VersionAnnonce', {
      version_code: v.version_code, version_name: v.version_name, envoye_par: admin.id, statut: 'en_cours',
      nb_emails: emails.length, emails_envoyes: 0, nb_appareils: appareils, restants: emails,
    });
    try {
      $app.save(rec); // index unique sur version_code : un second envoi simultané échoue ici
    } catch (_) {
      throw new fn.HttpError(409, 'Cette version vient déjà d’être annoncée.');
    }
    const t = lib.contenus(v);
    let pushRes = null;
    try {
      pushRes = notif.pushToAllowed(pushIds, { title: t.titre, body: t.corps, target_type: 'app_update', target_id: String(v.version_code) }, 'annoncerVersion');
    } catch (_) {
      pushRes = null;
    }
    const premier = lib.envoyerLot(rec, lib.LOT_EMAILS);
    return {
      success: true, version_name: v.version_name, version_code: v.version_code,
      destinataires: emails.length, appareils, emails_envoyes: premier.envoyes, emails_restants: premier.restants,
      push: pushRes ? notif.pushTotals(pushRes) : null,
    };
  });
});

// E-mails restants des annonces en cours : un lot par minute.
cronAdd('annonce_version', '* * * * *', () => {
  const lib = require(`${__hooks}/lib/annonceVersion.js`);
  let enCours = [];
  try { enCours = $app.findRecordsByFilter('VersionAnnonce', "statut = 'en_cours'", 'created', 5, 0); } catch (_) { enCours = []; }
  for (const rec of enCours) {
    try { lib.envoyerLot(rec, lib.LOT_EMAILS); } catch (err) { $app.logger().warn('[annonce_version] lot non envoyé', 'erreur', String(err)); }
  }
});
