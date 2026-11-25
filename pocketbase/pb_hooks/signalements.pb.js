// Aide et Assistance › « Signaler au responsable un problème technique » (version 1.3.22).
//  - POST /api/fn/signalerProbleme   (membre)      : { message, capture_url?, plateforme? } -> prévient le(s)
//    responsable(s) technique(s) seulement (push + e-mail) ; 5 signalements par jour au plus ;
//  - POST /api/fn/listerSignalements (responsable) : les signalements, les plus récents d'abord (marqués lus) ;
//  - POST /api/fn/reglerSignalement  (responsable) : { id, reponse } -> statut « réglé » et message automatique
//    « Shalom… » envoyé au membre dans les messages de Chay, par le compte « Chay » (on ne peut pas y répondre) ;
//  - POST /api/fn/estResponsableTechnique (membre) : { responsable: bool } (affichage du menu admin).
// Collection et comptes : pocketbase/scripts/migrer-1-3-22.mjs. Outils : lib/signalements.js.

routerAdd('POST', '/api/fn/estResponsableTechnique', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sig = require(`${__hooks}/lib/signalements.js`);
  return fn.run(e, 'estResponsableTechnique', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    return { responsable: sig.estResponsable(caller) };
  });
});

routerAdd('POST', '/api/fn/signalerProbleme', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sig = require(`${__hooks}/lib/signalements.js`);
  return fn.run(e, 'signalerProbleme', 'Signalement non envoyé', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const body = fn.readBody(e);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const capture = typeof body.capture_url === 'string' ? body.capture_url.trim() : '';
    const plateforme = typeof body.plateforme === 'string' ? body.plateforme.trim().slice(0, 100) : '';
    if (!message) throw new fn.HttpError(400, 'Décrivez le problème.');
    if (message.length > sig.MAX_MESSAGE) throw new fn.HttpError(400, 'Texte trop long.');
    if (capture && (capture.length > 2000 || !/^https:\/\//i.test(capture))) throw new fn.HttpError(400, 'Capture invalide.');

    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ');
    const recents = $app.findRecordsByFilter('SignalementTechnique', 'user_id = {:u} && created >= {:d}', '', sig.MAX_PAR_JOUR + 1, 0,
      { u: caller.id, d: depuis });
    if (recents.length >= sig.MAX_PAR_JOUR) throw new fn.HttpError(429, 'Trop de signalements aujourd’hui. Réessayez demain.');

    const username = [caller.getString('first_name'), caller.getString('last_name')].filter(Boolean).join(' ')
      || caller.getString('name')
      || caller.email() || 'Membre';
    const rec = fn.newRecord($app, 'SignalementTechnique', {
      user_id: caller.id, username, message, capture_url: capture, plateforme, statut: 'ouvert', lu: false,
    });
    $app.save(rec);

    // Prévenir le(s) responsable(s) technique(s) seulement : push et e-mail. Un échec n'annule pas le signalement.
    try {
      const resp = sig.responsables($app);
      const ids = resp.map((r) => r.id);
      if (ids.length) {
        const push = require(`${__hooks}/lib/push.js`);
        push.sendToUsers(ids, {
          title: '🛠️ Problème technique signalé',
          body: `${username} : ${message.slice(0, 120)}`,
          target_type: 'signalement', target_id: rec.id, route: '/admin/signalements',
        }, 'signalerProbleme');
      }
      const mail = require(`${__hooks}/lib/courriel.js`);
      const lien = `${mail.appUrl()}/admin/signalements`;
      for (const r of resp) {
        const email = r.email();
        if (!email) continue;
        mail.trySend('signalerProbleme', email, `Problème technique signalé par ${username}`,
          mail.shell('Problème technique signalé',
            mail.paragraph(`<strong>${mail.escapeHtml(username)}</strong> a signalé un problème technique.`)
            + mail.paragraph(mail.escapeHtml(message), 'border-left:3px solid #8A56E2;padding-left:12px;white-space:pre-line;')
            + (capture ? mail.paragraph('Une capture d’écran est jointe au signalement.') : '')
            + mail.button(lien, 'Voir le signalement')),
          `${username} a signalé un problème technique.\n\n${message}\n\nVoir le signalement : ${lien}`);
      }
    } catch (_) {
      $app.logger().error('[signalerProbleme] signalement enregistré, notification du responsable impossible');
    }
    return { id: rec.id };
  });
});

routerAdd('POST', '/api/fn/listerSignalements', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sig = require(`${__hooks}/lib/signalements.js`);
  return fn.run(e, 'listerSignalements', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    if (!sig.estResponsable(caller)) throw new fn.HttpError(403, 'Réservé au responsable technique.');
    const rows = $app.findRecordsByFilter('SignalementTechnique', "id != ''", '-created', 300, 0);
    const items = rows.map((r) => ({
      id: r.id,
      user_id: r.getString('user_id'),
      username: r.getString('username'),
      message: r.getString('message'),
      capture_url: r.getString('capture_url'),
      plateforme: r.getString('plateforme'),
      statut: r.getString('statut') || 'ouvert',
      reponse: r.getString('reponse'),
      regle_le: r.getString('regle_le'),
      created: r.getString('created'),
      lu: r.getBool('lu'),
    }));
    for (const r of rows) {
      if (!r.getBool('lu')) { r.set('lu', true); $app.save(r); }
    }
    return { items };
  });
});

routerAdd('POST', '/api/fn/reglerSignalement', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sig = require(`${__hooks}/lib/signalements.js`);
  const conv = require(`${__hooks}/lib/conversations.js`);
  return fn.run(e, 'reglerSignalement', 'Signalement non réglé', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    if (!sig.estResponsable(caller)) throw new fn.HttpError(403, 'Réservé au responsable technique.');
    const body = fn.readBody(e);
    const id = typeof body.id === 'string' && body.id.length <= 64 ? body.id : '';
    const reponse = typeof body.reponse === 'string' ? body.reponse.trim() : '';
    if (!id) throw new fn.HttpError(400, 'id requis');
    if (reponse.length > sig.MAX_REPONSE) throw new fn.HttpError(400, 'Message trop long.');
    const rec = fn.findById('SignalementTechnique', id);
    if (!rec) throw new fn.HttpError(404, 'Signalement introuvable');
    if (rec.getString('statut') === 'regle') throw new fn.HttpError(409, 'Déjà réglé.');
    const systeme = sig.compteSysteme($app);
    if (!systeme) throw new fn.HttpError(500, 'Compte « Chay » absent (migration 1.3.22).');
    const membreId = rec.getString('user_id');
    if (!fn.findById('users', membreId)) throw new fn.HttpError(404, 'Le membre n’existe plus.');

    let message = null;
    $app.runInTransaction((tx) => {
      let c = conv.findDirect(tx, systeme.id, membreId);
      if (!c) {
        c = fn.newRecord(tx, 'Conversation', { type: 'direct', participant_ids: [systeme.id, membreId], created_by_id: systeme.id });
        tx.save(c);
      }
      message = fn.newRecord(tx, 'Message', {
        conversation_id: c.id,
        participant_ids: [systeme.id, membreId],
        sender_id: systeme.id,
        sender_name: 'Chay',
        text: sig.texteRegle(reponse),
        image_url: '',
        reply_to_id: '',
        read_by: [systeme.id],
        created_by_id: systeme.id,
      });
      tx.save(message);
      try { c.set('last_message_at', new DateTime()); tx.save(c); } catch (_) { /* champ absent : sans effet */ }
      rec.set('statut', 'regle');
      rec.set('reponse', reponse);
      rec.set('regle_le', new DateTime());
      tx.save(rec);
    });

    // Push et e-mail au membre, comme un message ordinaire (expéditeur « Chay »).
    try {
      const notif = require(`${__hooks}/lib/notifications.js`);
      notif.messagePush(message);
    } catch (_) {
      $app.logger().error('[reglerSignalement] message envoyé, notification impossible');
    }
    return { ok: true };
  });
});
