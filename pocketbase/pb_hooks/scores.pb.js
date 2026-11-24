// Score Boards (1.3.22) : enregistrement des scores et classements (calculs : lib/scores.js ; collection ScoreJeu :
// pocketbase/scripts/migrer-1-3-22.mjs). Quiz et Mots mélangés : points ajoutés par fn_jeux.pb.js (serveur).
//  - POST /api/fn/enregistrerScore { jeu, score | pieces | etoiles + niveau, pseudo?, avatar? } : Émojis, Brique,
//    Puzzle (adultes) et Jeux Carte (« memory », enfants : pseudo et avatar obligatoires) ; 120 scores / heure au plus ;
//  - POST /api/fn/classement { espace: adulte | enfant, jeu: general | <jeu>, periode: semaine | mois | toujours,
//    pseudo? } -> { top: [5 premiers], moi: { rang, points } | null }.

routerAdd('POST', '/api/fn/enregistrerScore', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sc = require(`${__hooks}/lib/scores.js`);
  return fn.run(e, 'enregistrerScore', 'Score non enregistré', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const b = fn.readBody(e);
    const jeu = typeof b.jeu === 'string' ? b.jeu : '';
    if (sc.JEUX_CLIENT.indexOf(jeu) === -1) throw new fn.HttpError(400, 'Jeu inconnu');
    const enfant = sc.espaceDe(jeu, b.pseudo) === 'enfant';
    const pseudo = enfant ? sc.pseudoValide(b.pseudo) : '';
    if (enfant && !pseudo) throw new fn.HttpError(400, 'Pseudo invalide');
    const points = sc.pointsClient(jeu, b);
    if (!points) return { points: 0 };
    const uneHeure = sc.datePb(Date.now() - 3600 * 1000);
    const recents = $app.findRecordsByFilter('ScoreJeu', 'user_id = {:u} && created >= {:d}', '', 121, 0, { u: caller.id, d: uneHeure });
    if (recents.length >= 120) throw new fn.HttpError(429, 'Trop de parties en une heure.');
    const rec = fn.newRecord($app, 'ScoreJeu', {
      user_id: caller.id, espace: enfant ? 'enfant' : 'adulte', jeu, points,
      pseudo, avatar: enfant ? sc.avatarValide(b.avatar) : '',
    });
    $app.save(rec);
    // 1.3.26 : l'enfant est gardé dans les profils du compte (« Qui joue ? »), même s'il a été créé ailleurs.
    if (enfant) {
      try {
        const deja = $app.findRecordsByFilter('ProfilEnfant', 'user_id = {:u} && pseudo = {:p}', '', 1, 0, { u: caller.id, p: pseudo });
        if (!deja.length) $app.save(fn.newRecord($app, 'ProfilEnfant', { user_id: caller.id, pseudo, avatar: sc.avatarValide(b.avatar), progres: {} }));
      } catch (_) { /* collection absente (migration 1.3.26 pas encore faite) : le score reste enregistré */ }
    }
    return { points };
  });
});

routerAdd('POST', '/api/fn/classement', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const sc = require(`${__hooks}/lib/scores.js`);
  const fz = require(`${__hooks}/lib/fuseaux.js`);
  return fn.run(e, 'classement', 'Classement indisponible', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const b = fn.readBody(e);
    const espace = b.espace === 'enfant' ? 'enfant' : 'adulte';
    const jeu = typeof b.jeu === 'string' && sc.JEUX[espace].indexOf(b.jeu) !== -1 ? b.jeu : 'general';
    const periode = ['semaine', 'mois', 'toujours'].indexOf(b.periode) !== -1 ? b.periode : 'semaine';
    const maintenant = Date.now();
    const debut = sc.debutPeriode(periode, maintenant, fz.offsetMinutes('Europe/Paris', maintenant) || 60);

    let filtre = 'espace = {:e}';
    const params = { e: espace, d: sc.datePb(debut), j: jeu };
    if (debut > 0) filtre += ' && created >= {:d}';
    if (jeu !== 'general') filtre += ' && jeu = {:j}';
    const rows = $app.findRecordsByFilter('ScoreJeu', filtre, '', 50000, 0, params);

    const infos = {};
    const lignes = rows.map((r) => {
      const uid = r.getString('user_id');
      const cle = espace === 'enfant' ? `${uid}|${r.getString('pseudo')}` : uid;
      if (espace === 'enfant') infos[cle] = { nom: r.getString('pseudo'), avatar: r.getString('avatar'), uid };
      return { cle, points: r.getInt('points') };
    });
    const liste = sc.classer(lignes);

    const moiCle = espace === 'enfant' ? `${caller.id}|${sc.pseudoValide(b.pseudo)}` : caller.id;
    const decrire = (x) => {
      const out = { rang: x.rang, points: x.points, moi: x.cle === moiCle };
      if (espace === 'enfant') {
        const i = infos[x.cle] || {};
        out.nom = i.nom || 'Enfant';
        out.avatar = i.avatar || sc.AVATARS[0];
        return out;
      }
      const u = fn.findById('users', x.cle);
      const prof = fn.findOne($app, 'MemberProfile', 'created_by_id = {:u}', '-base44_created_date,-created', { u: x.cle });
      out.nom = (prof && prof.getString('display_name'))
        || (u && ([u.getString('first_name'), u.getString('last_name')].filter(Boolean).join(' ') || u.getString('name')))
        || 'Membre';
      out.photo = (prof && prof.getString('avatar_url')) || (u && u.getString('profile_photo_url')) || '';
      out.user_id = x.cle;
      return out;
    };
    const top = liste.slice(0, 5).map(decrire);
    const mien = liste.find((x) => x.cle === moiCle);
    return {
      espace, jeu, periode,
      top,
      moi: mien ? { rang: mien.rang, points: mien.points, dansTop: top.some((t) => t.moi) } : null,
      participants: liste.length,
    };
  });
});
