// Tableau de bord de l'application (1.3.25). Règles pures : lib/activite.js. Collections ActiviteJour et
// PositionMembre : pocketbase/scripts/migrer-1-3-25.mjs (lecture et écriture réservées au serveur).
//  - POST /api/chay/activite (membre connecté) : temps passé, sections ouvertes, position arrondie (~5 km).
//  - GET  /api/chay/admin/stats (admins) : chiffres du tableau de bord et points de la carte.
//  - GET  /api/chay/admin/requetes (admins) : sujets de prière (Accueil › Requêtes), sans le nom de l'auteur.
//  - POST /api/chay/admin/requetes/supprimer { id } (admins) : retirer un sujet de prière.

routerAdd('POST', '/api/chay/activite', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'activite', 'Erreur interne', () => {
    const act = require(`${__hooks}/lib/activite.js`);
    const site = require(`${__hooks}/lib/siteChay.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    const user = fn.requireUser(e);
    // Un ping toutes les 20 s au plus par membre (l'app en envoie un par minute).
    if (!notif.hit(`activite:${user.id}`, 1, 20 * 1000)) return { ok: true, ignore: true };
    const ping = act.lirePing(fn.readBody(e));
    const jour = site.jourParis(Date.now());

    if (ping.secondes || Object.keys(ping.sections).length) {
      const rec = fn.findOne($app, 'ActiviteJour', 'user = {:u} && jour = {:j}', '', { u: user.id, j: jour });
      if (rec) {
        let avant = {};
        try { avant = fn.plain(rec).sections || {}; } catch (_) { avant = {}; }
        rec.set('secondes', (rec.getInt('secondes') || 0) + ping.secondes);
        rec.set('sections', act.fusionnerSections(avant, ping.sections));
        $app.save(rec);
      } else {
        $app.save(fn.newRecord($app, 'ActiviteJour', {
          user: user.id, jour, secondes: ping.secondes, sections: act.fusionnerSections({}, ping.sections),
        }));
      }
    }

    if (ping.sansPosition) {
      const pos = fn.findOne($app, 'PositionMembre', 'user = {:u}', '', { u: user.id });
      if (pos) $app.delete(pos);
    } else if (ping.position) {
      const pos = fn.findOne($app, 'PositionMembre', 'user = {:u}', '', { u: user.id });
      const valeurs = { user: user.id, lat: ping.position.lat, lon: ping.position.lon, jour };
      if (pos) {
        pos.set('lat', valeurs.lat);
        pos.set('lon', valeurs.lon);
        pos.set('jour', jour);
        $app.save(pos);
      } else {
        $app.save(fn.newRecord($app, 'PositionMembre', valeurs));
      }
    }
    return { ok: true };
  });
});

routerAdd('GET', '/api/chay/admin/stats', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'adminStats', 'Statistiques indisponibles', () => {
    fn.requireAdmin(e);
    const act = require(`${__hooks}/lib/activite.js`);
    const site = require(`${__hooks}/lib/siteChay.js`);
    const jour = site.jourParis(Date.now());
    const b = act.bornes(jour);
    const debut = b.semaine < b.mois ? b.semaine : b.mois;

    // 1.3.32 : mêmes comptes que Communauté › Utilisateurs : inscription terminée (prénom ou nom), compte actif,
    // hors compte automatique « Chay ».
    const membres = $app.findRecordsByFilter('users', 'disabled != true && systeme != true', '', 0, 0)
      .filter((u) => (u.getString('first_name') || u.getString('last_name')).trim())
      .map((u) => {
      const p = fn.plain(u);
      const cree = fn.createdDate(p);
      const nom = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Membre';
      return { id: u.id, cree: cree ? site.jourParis(Date.parse(cree)) : '', nom, photo: p.profile_photo_url || '' };
    });
    const lignes = $app.findRecordsByFilter('ActiviteJour', 'jour >= {:d}', '', 0, 0, { d: debut }).map((r) => {
      const p = fn.plain(r);
      return { user: p.user, jour: p.jour, secondes: p.secondes, sections: p.sections };
    });
    const positions = $app.findRecordsByFilter('PositionMembre', 'id != ""', '', 0, 0).map((r) => {
      const p = fn.plain(r);
      return { user: p.user, lat: Number(p.lat), lon: Number(p.lon), maj: p.jour };
    });
    return act.statistiques({ membres, lignes, positions, jour });
  });
});

routerAdd('GET', '/api/chay/admin/requetes', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'adminRequetes', 'Liste indisponible', () => {
    fn.requireAdmin(e);
    const items = $app.findRecordsByFilter('PrayerRequest', 'id != ""', '-created', 300, 0).map((r) => {
      const p = fn.plain(r);
      return {
        id: r.id,
        contenu: p.content || '',
        categorie: p.category || '',
        statut: p.status || '',
        date: fn.createdDate(p),
      };
    });
    return { items };
  });
});

routerAdd('POST', '/api/chay/admin/requetes/supprimer', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'adminRequetesSupprimer', 'Suppression impossible', () => {
    fn.requireAdmin(e);
    const id = fn.requireString(fn.readBody(e), 'id', 'id requis', 64);
    const rec = fn.findById('PrayerRequest', id);
    if (!rec) throw new fn.HttpError(404, 'Sujet introuvable');
    $app.delete(rec);
    return { supprime: true };
  });
});

// Widget « Verset du jour » de l'écran d'accueil Android (VersetWidget.java, 1.3.25) : public, sans compte.
// Le verset daté d'aujourd'hui (heure de Paris), sinon le dernier verset passé. Jamais de verset programmé à l'avance.
routerAdd('GET', '/api/chay/verset-du-jour', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'versetDuJour', 'Verset indisponible', () => {
    const site = require(`${__hooks}/lib/siteChay.js`);
    const jour = site.jourParis(Date.now());
    const rec = fn.findOne($app, 'Devotional', 'reading_date != "" && reading_date <= {:fin}', '-reading_date', { fin: `${jour} 23:59:59.999Z` });
    if (!rec) return { reference: 'Philippiens 4:13', texte: 'Je puis tout par celui qui me fortifie.', jour };
    const p = fn.plain(rec);
    return {
      reference: String(p.scripture_reference || '').slice(0, 120),
      texte: String(p.verse_text || p.title || '').slice(0, 1200),
      jour: String(p.reading_date || '').slice(0, 10),
    };
  });
});
