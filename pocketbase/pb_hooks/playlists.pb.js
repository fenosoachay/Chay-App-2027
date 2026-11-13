// Playlists et sous-playlists (1.3.9) : contrôle des écritures venant de l'app (API).
//  - CAUSE DU BUG EN PROD : champ Playlist.parent_id avec l'option « Hidden ». PocketBase n'accepte alors ce champ
//    que du superuser : pour un admin de l'app, il est IGNORÉ sans erreur (parent_id vide en base) et n'est pas
//    renvoyé dans les réponses. Une requête dont le parent_id envoyé n'a pas été appliqué est désormais REFUSÉE
//    (400, message explicite) ; la migration migrer-1-3-9.mjs retire l'option « Hidden ».
//  - Champ Playlist.parent_id ABSENT du schéma (migration migrer-playlists.mjs non appliquée) : une requête qui
//    envoie un parent_id est REFUSÉE (400, message explicite). Sans ce contrôle, PocketBase ignorait le champ en
//    silence : la sous-playlist devenait une playlist de premier niveau et le sélecteur « Sous-playlist » de
//    l'admin restait vide (bug de la 1.3.8).
//  - parent_id fourni : la playlist parente doit exister, être de premier niveau (un seul niveau de
//    sous-playlists) et de la même section (category) ; une playlist qui a des sous-playlists ne peut pas
//    elle-même devenir une sous-playlist.
// Le superuser (tableau d'administration, scripts) n'est pas contrôlé ici.

function controlerPlaylist(e) {
  if (e.hasSuperuserAuth()) return e.next();
  let body = {};
  try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }
  const envoye = body.parent_id;
  const champ = e.record.collection().fields.getByName('parent_id');
  if (!champ) {
    if (envoye !== undefined && envoye !== null && String(envoye) !== '') {
      throw new BadRequestError("Sous-playlist impossible : le champ « parent_id » manque dans la collection Playlist. Appliquer pocketbase/scripts/migrer-playlists.mjs.");
    }
    return e.next();
  }
  // Champ caché (« Hidden ») : PocketBase le retire de la requête AVANT les hooks (il n'y est même plus visible) ;
  // une sous-playlist serait enregistrée comme playlist de premier niveau. Toute écriture est refusée tant que la
  // configuration n'est pas corrigée (migrer-1-3-9.mjs), au lieu de corrompre les données en silence.
  if (champ.hidden) {
    throw new BadRequestError("Playlists : le champ « parent_id » de la collection Playlist est caché (option « Hidden ») ; les sous-playlists ne peuvent pas être enregistrées. Appliquer pocketbase/scripts/migrer-1-3-9.mjs.");
  }
  const parentId = e.record.getString('parent_id');
  // parent_id envoyé mais pas appliqué (autre filtre) : refus explicite.
  if (envoye !== undefined && envoye !== null && String(envoye) !== parentId) {
    throw new BadRequestError("Sous-playlist non rattachée : le serveur n'accepte pas le champ « parent_id » de la collection Playlist (option « Hidden » cochée ?). Appliquer pocketbase/scripts/migrer-1-3-9.mjs.");
  }
  if (parentId) {
    if (parentId === e.record.id) throw new BadRequestError('Une playlist ne peut pas être sa propre sous-playlist.');
    let parent = null;
    try { parent = $app.findRecordById('Playlist', parentId); } catch (_) { parent = null; }
    if (!parent) throw new BadRequestError('Playlist parente introuvable.');
    if (parent.getString('parent_id')) throw new BadRequestError('Un seul niveau de sous-playlists : la playlist parente est déjà une sous-playlist.');
    if ((parent.getString('category') || 'music') !== (e.record.getString('category') || 'music')) {
      throw new BadRequestError('La sous-playlist doit être dans la même section que sa playlist parente.');
    }
    if (e.record.id) {
      const enfants = $app.findRecordsByFilter('Playlist', 'parent_id = {:id}', '', 1, 0, { id: e.record.id });
      if (enfants.length) throw new BadRequestError('Cette playlist a des sous-playlists : elle ne peut pas devenir une sous-playlist.');
    }
  }
  e.next();
}

onRecordCreateRequest(controlerPlaylist, 'Playlist');
onRecordUpdateRequest(controlerPlaylist, 'Playlist');
