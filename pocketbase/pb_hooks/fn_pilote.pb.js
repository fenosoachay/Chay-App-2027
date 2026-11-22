// Bloc 2 (pilote) : équivalents des fonctions Base44
//   listCommunityUsers, getPrayerWall, recordMediaListen, recordVideoView
// Chaque handler s'exécute isolé : le module partagé est chargé dans le handler.
// L'appelant est toujours identifié par e.auth (jamais par un id envoyé par le client).

// base44/functions/listCommunityUsers : annuaire, champs publics uniquement.
routerAdd('POST', '/api/fn/listCommunityUsers', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'listCommunityUsers', 'Erreur interne', () => {
    fn.requireUser(e, 'Connexion requise');
    const records = $app.findRecordsByFilter('users', 'systeme != true', '-base44_created_date,-created', 100, 0); // sans le compte automatique « Chay »
    // Sans les inscriptions jamais terminées (ni prénom ni nom) : elles s'affichaient « Membre ».
    const users = records.filter((r) => (r.getString('first_name') || r.getString('last_name')).trim()).map((r) => ({
      id: r.id,
      first_name: r.getString('first_name') || '',
      last_name: r.getString('last_name') || '',
      profile_photo_url: r.getString('profile_photo_url') || '',
      role: r.getString('role'),
    }));
    return { users };
  });
});

// base44/functions/getPrayerWall : prières ouvertes, champs publics uniquement
// (requester_id et taken_by ne quittent jamais le serveur).
routerAdd('POST', '/api/fn/getPrayerWall', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'getPrayerWall', 'Erreur interne', () => {
    fn.requireUser(e, 'Connexion requise.');
    const rows = $app.findRecordsByFilter('PrayerRequest', "status = 'open'", '-base44_created_date,-created', 200, 0);
    const items = rows.map((r) => {
      const p = fn.plain(r);
      const out = { id: p.id };
      if (p.category !== undefined && p.category !== null) out.category = p.category;
      if (p.content !== undefined && p.content !== null) out.content = p.content;
      const created = fn.createdDate(p);
      if (created) out.created_date = created;
      if (p.status !== undefined && p.status !== null) out.status = p.status;
      return out;
    });
    return { items, count: items.length };
  });
});

// base44/functions/recordMediaListen : +1 écoute sur une piste audio.
routerAdd('POST', '/api/fn/recordMediaListen', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'recordMediaListen', 'Could not record listen', () => {
    fn.requireUser(e, 'Unauthorized');
    const id = fn.requireString(fn.readBody(e), 'playlist_track_id', 'playlist_track_id required');
    // Pas d'exception JS dans la transaction (elle traverserait le code Go) : on note l'absence et on sort.
    let count = null;
    $app.runInTransaction((txApp) => {
      let track = null;
      try { track = txApp.findRecordById('PlaylistTrack', id); } catch (_) { track = null; }
      if (!track || !track.getString('audio_url')) return;
      count = Math.max(0, Math.floor(Number(track.get('listen_count')) || 0)) + 1;
      track.set('listen_count', count);
      txApp.save(track);
    });
    if (count === null) throw new fn.HttpError(404, 'audio track not found');
    return { listen_count: count };
  });
});

// base44/functions/recordVideoView : +1 vue par utilisateur et par vidéo.
routerAdd('POST', '/api/fn/recordVideoView', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'recordVideoView', 'Could not record view', () => {
    const user = fn.requireUser(e, 'Unauthorized');
    const id = fn.requireString(fn.readBody(e), 'video_id', 'video_id required');
    let result = null;
    $app.runInTransaction((txApp) => {
      let video = null;
      try { video = txApp.findRecordById('Video', id); } catch (_) { video = null; }
      if (!video) return;
      const p = fn.plain(video);
      const viewedBy = Array.isArray(p.viewed_by) ? p.viewed_by : [];
      const current = Math.max(0, Math.floor(Number(p.view_count) || 0));
      if (viewedBy.indexOf(user.id) !== -1) {
        result = { view_count: current, already_viewed: true };
        return;
      }
      video.set('view_count', current + 1);
      video.set('viewed_by', viewedBy.concat([user.id]));
      txApp.save(video);
      result = { view_count: current + 1 };
    });
    if (result === null) throw new fn.HttpError(404, 'Video not found');
    return result;
  });
});
