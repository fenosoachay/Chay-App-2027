// Nouveaux membres (1.3.24) :
//  - quand un compte termine son inscription (consentements acceptés, après le code e-mail), tous les admins
//    reçoivent « 👋 Nouveau membre » (cloche + push) ; la notification ouvre Gérer les membres sur ce compte ;
//  - quand le prénom / nom d'un compte change, son profil public resté « Membre » ou vide reprend le vrai nom.
// Après l'enregistrement seulement (e.next() d'abord) : un échec de notification n'annule jamais l'inscription.

onRecordUpdateRequest((e) => {
  const avant = {
    consents_accepted: e.record.original().getBool('consents_accepted'),
    first_name: e.record.original().getString('first_name'),
    last_name: e.record.original().getString('last_name'),
  };
  e.next();

  const nm = require(`${__hooks}/lib/nouveauxMembres.js`);
  const u = e.record;
  const apres = {
    consents_accepted: u.getBool('consents_accepted'),
    systeme: u.getBool('systeme'),
  };
  const nom = nm.nomComplet(u.getString('first_name'), u.getString('last_name'));

  // Profil public resté « Membre » : il reprend le vrai nom.
  if (nom && nom !== nm.nomComplet(avant.first_name, avant.last_name)) {
    try {
      const profils = $app.findRecordsByFilter('MemberProfile', 'created_by_id = {:u}', '', 10, 0, { u: u.id });
      for (const p of profils) {
        if (!nm.profilARetablir(p.getString('display_name'), nom)) continue;
        p.set('display_name', nom);
        $app.save(p);
      }
    } catch (_) {
      $app.logger().error('[nouveauxMembres] profil public non mis à jour', 'user', u.id);
    }
  }

  if (!nm.inscriptionTerminee(avant, apres)) return;
  try {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const n = nm.notificationNouveauMembre(u.id, nom);
    if (notif.notificationExists(n.notification_id)) return;
    const admins = $app.findRecordsByFilter('users', "role = 'admin' && disabled != true && systeme != true", '', 0, 0)
      .map((a) => a.id)
      .filter((id) => id !== u.id);
    if (!admins.length) return;
    notif.createNotifications(admins.map((id) => ({
      user_id: id, notification_id: n.notification_id, type: 'nouveau_membre', content_type: 'nouveau_membre',
      content_id: u.id, title: n.title, message: n.body, is_read: false,
    })), 'nouveauMembre');
    notif.pushToAllowed(admins, { title: n.title, body: n.body, target_type: 'nouveau_membre', target_id: u.id, route: n.route }, 'nouveauMembre');
  } catch (_) {
    $app.logger().error('[nouveauxMembres] notification des admins impossible', 'user', u.id);
  }
}, 'users');
