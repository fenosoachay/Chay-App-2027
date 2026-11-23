// Site public chay.fr (refonte 2026). Contenus gérés dans l'app › Administration › « Site chay.fr ».
//  - POST /api/chay/site/contact (public, sans compte) : formulaire « Nous contacter » du site.
//    Le message est rangé dans ContactMessage (source « site ») et les admins sont prévenus (cloche + push,
//    ouverture d'Administration › Messages). Anti-robots : champ piège, délai minimum, 3 envois par IP et
//    par heure, 5 par adresse e-mail et par jour.
//  - SiteCulte : le lien YouTube collé par l'admin est vérifié ; l'identifiant est rangé dans youtube_id et, si le
//    titre est vide, il est repris de YouTube (oEmbed, sans clé).
//  - POST /api/chay/site/visite (public) : compteur de visites (SiteVisite, une ligne par jour).
//  - tâche planifiée site_direct (toutes les 5 minutes) : la chaîne YouTube est-elle en direct ? Résultat dans
//    SiteEtat (cle « direct ») ; le site affiche alors le bandeau « Culte en direct ».
// Collections : pocketbase/scripts/migrer-site-chay.mjs. Règles : lib/siteChay.js.

routerAdd('POST', '/api/chay/site/contact', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'siteContact', 'Message non envoyé', () => {
    const site = require(`${__hooks}/lib/siteChay.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    const d = site.lireContact(fn.readBody(e));
    if (d.robot) return { envoye: true };
    if (d.erreur) throw new fn.HttpError(400, d.erreur);
    let ip = '';
    try { ip = e.realIP() || ''; } catch (_) { ip = ''; }
    if (!notif.hit(`site_contact_ip:${ip || 'inconnue'}`, site.PAR_IP_HEURE, 3600 * 1000)) {
      throw new fn.HttpError(429, 'Trop de messages envoyés. Réessayez dans une heure.');
    }
    const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ');
    const recents = $app.findRecordsByFilter('ContactMessage', 'email = {:m} && created >= {:d}', '', site.PAR_EMAIL_JOUR + 1, 0,
      { m: d.valeurs.email, d: depuis });
    if (recents.length >= site.PAR_EMAIL_JOUR) throw new fn.HttpError(429, 'Trop de messages envoyés aujourd’hui avec cette adresse.');

    const rec = fn.newRecord($app, 'ContactMessage', {
      name: d.valeurs.nom, email: d.valeurs.email, subject: d.valeurs.sujet, message: d.valeurs.message, source: 'site',
    });
    $app.save(rec);

    // Prévenir les admins. Un échec n'annule pas le message.
    try {
      const n = site.notificationMessage(rec.id, d.valeurs.nom, d.valeurs.sujet);
      const admins = $app.findRecordsByFilter('users', "role = 'admin' && disabled != true && systeme != true", '', 0, 0).map((a) => a.id);
      if (admins.length && !notif.notificationExists(n.notification_id)) {
        notif.createNotifications(admins.map((id) => ({
          user_id: id, notification_id: n.notification_id, type: 'message_site', content_type: 'message_site',
          content_id: rec.id, title: n.title, message: n.body, is_read: false,
        })), 'siteContact');
        notif.pushToAllowed(admins, { title: n.title, body: n.body, target_type: 'message_site', target_id: rec.id, route: n.route }, 'siteContact');
      }
    } catch (_) {
      $app.logger().error('[siteContact] message enregistré, notification des admins impossible');
    }
    return { envoye: true };
  });
});

// Visites du site : POST /api/chay/site/visite (public). Le site l'appelle une fois par visite (30 minutes) ;
// le serveur ne compte qu'une visite par adresse IP et par 30 minutes. Une ligne SiteVisite par jour (heure de Paris).
routerAdd('POST', '/api/chay/site/visite', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'siteVisite', 'Visite non comptée', () => {
    const site = require(`${__hooks}/lib/siteChay.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    let ip = '';
    try { ip = e.realIP() || ''; } catch (_) { ip = ''; }
    if (!notif.hit(`site_visite:${ip || 'inconnue'}`, 1, 30 * 60 * 1000)) return { compte: false };
    const jour = site.jourParis(Date.now());
    const rec = fn.findOne($app, 'SiteVisite', 'jour = {:j}', '', { j: jour });
    if (rec) {
      rec.set('visites', (Number(rec.get('visites')) || 0) + 1);
      $app.save(rec);
    } else {
      $app.save(fn.newRecord($app, 'SiteVisite', { jour, visites: 1 }));
    }
    return { compte: true };
  });
});

// Cultes YouTube : identifiant vérifié + titre repris de YouTube si l'admin l'a laissé vide (lib/siteChay.js).
// (Une fonction déclarée ici ne serait pas visible dans les handlers : chaque handler s'exécute isolé.)
onRecordCreateRequest((e) => require(`${__hooks}/lib/siteChay.js`).preparerCulte(e), 'SiteCulte');
onRecordUpdateRequest((e) => require(`${__hooks}/lib/siteChay.js`).preparerCulte(e), 'SiteCulte');

// Direct YouTube : vérification toutes les 5 minutes (page publique de la chaîne, sans clé).
cronAdd('site_direct', '*/5 * * * *', () => {
  const site = require(`${__hooks}/lib/siteChay.js`);
  const fn = require(`${__hooks}/lib/fn.js`);
  let etat = { en_direct: false, video_id: '' };
  try {
    const res = $http.send({
      url: 'https://www.youtube.com/@EgliseChay.fr-tv/live',
      method: 'GET',
      timeout: 15,
      // Évite la page de consentement européenne (sans cookie, YouTube ne renvoie pas la page de la vidéo).
      headers: { 'Accept-Language': 'fr-FR,fr;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+1', 'User-Agent': 'Mozilla/5.0 (compatible; ChaySite/1.0)' },
    });
    if (res.statusCode !== 200) return;
    etat = site.lireDirect(toString(res.body || []));
  } catch (_) {
    return; // réseau indisponible : on garde le dernier état connu
  }
  try {
    const valeur = JSON.stringify({ en_direct: etat.en_direct, video_id: etat.video_id, verifie: new Date().toISOString() });
    const existant = fn.findOne($app, 'SiteEtat', 'cle = {:c}', '', { c: 'direct' });
    if (existant) {
      existant.set('valeur', valeur);
      $app.save(existant);
    } else {
      $app.save(fn.newRecord($app, 'SiteEtat', { cle: 'direct', valeur }));
    }
  } catch (_) {
    $app.logger().error('[siteDirect] état non enregistré');
  }
});
