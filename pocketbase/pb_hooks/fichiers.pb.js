// Fichiers (bloc 4). Rappel : sous Windows, redémarrer PocketBase après modification.
//
// Collections Fichier (membres : images et audio, 15 Mo) et FichierAdmin (admins : images, audio, PDF, 100 Mo) :
//  - propriétaire imposé par le serveur (e.auth.id) ; la règle refuse un autre propriétaire ;
//  - nom de fichier aléatoire (le nom d'origine n'est pas conservé) ;
//  - taille et type réel vérifiés par PocketBase (maxSize / mimeTypes du champ « fichier ») ;
//  - AUCUNE vidéo (mp4, m4v, mov, webm, mkv) : toutes les vidéos vont sur R2, quelle que soit leur taille, pour
//    que les sauvegardes de PocketBase restent petites (refus 415 ici et dans upload_chunk).
//
// Routes (même forme de réponse que les fonctions Base44 attendues par src/lib/upload.js) :
//  POST /api/fn/upload_chunk              (admin) fichiers de 15 à 100 Mo (sauf vidéos), morceaux de 8 Mo -> FichierAdmin
//  POST /api/fn/initMultipartUpload       (admin) TOUTE vidéo vers R2 (de 1 octet à 5 Go), vidéo seulement
//  POST /api/fn/getPresignedUrl           (admin) état de reprise / URL présignée d'une part (taille imposée)
//  POST /api/fn/completeMultipartUpload   (admin) assemblage, contrôle de taille et du type réel (octets de tête)
//  POST /api/fn/cleanupIncompleteUploads  (admin) nettoyage immédiat des sessions de plus de 24 h
//  POST /api/fn/cleanupOrphanFiles        (superuser) fichiers non référencés (simulation possible)
// Tâches planifiées : sessions incomplètes toutes les heures ; fichiers non référencés le dimanche à 3 h 30.

// ── Collections Fichier / FichierAdmin ───────────────────────────────────────
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    if (e.auth && e.auth.collection().name === 'users') e.record.set('proprietaire', e.auth.id);
  }
  const lib = require(`${__hooks}/lib/televersement.js`);
  const value = e.record.get('fichier');
  const files = Array.isArray(value) ? value : [value];
  for (const f of files) {
    if (f && typeof f === 'object' && 'originalName' in f) {
      if (lib.isVideoName(f.originalName)) throw new ApiError(415, lib.VIDEO_REFUSED);
      f.name = lib.randomFileName(f.originalName, 'bin');
    }
  }
  e.next();
}, 'Fichier', 'FichierAdmin');

// Remplacement du fichier d'un enregistrement existant : même refus des vidéos.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib/televersement.js`);
  const value = e.record.get('fichier');
  const files = Array.isArray(value) ? value : [value];
  for (const f of files) {
    if (f && typeof f === 'object' && 'originalName' in f) {
      if (lib.isVideoName(f.originalName)) throw new ApiError(415, lib.VIDEO_REFUSED);
      f.name = lib.randomFileName(f.originalName, 'bin');
    }
  }
  e.next();
}, 'Fichier', 'FichierAdmin');

// ── upload_chunk : 15 à 100 Mo, par morceaux (reprise possible) ──────────────
routerAdd('POST', '/api/fn/upload_chunk', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'upload_chunk', 'Échec du téléversement', () => {
    const user = fn.requireAdmin(e, 'Unauthorized: admin requis');
    // findUploadedFiles lève une erreur si la requête ne contient pas de fichier « chunk » (init, finalize).
    let uploaded = [];
    try { uploaded = e.findUploadedFiles('chunk'); } catch (_) { uploaded = []; }
    const body = fn.readBody(e);
    const field = (k) => {
      const v = body[k];
      return Array.isArray(v) ? v[0] : v;
    };
    const action = field('action');
    const sessionId = lib.requireSessionId({ session_id: field('session_id') });

    if (action === 'init') {
      const size = Number(field('size'));
      if (!Number.isInteger(size) || size <= 0) throw new fn.HttpError(400, 'taille invalide');
      if (size > lib.MAX_CHUNKED_BYTES) throw new fn.HttpError(413, 'Fichier trop volumineux (max 100 Mo)');
      const name = String(field('name') || 'fichier').slice(0, 200);
      if (lib.isVideoName(name)) throw new fn.HttpError(415, lib.VIDEO_REFUSED);
      // Session terminée : jamais réutilisée (le session_id du client, tronqué, peut désigner un autre
      // fichier de même nom et même taille) -> nouvelle session ci-dessous.
      let session = lib.findSession(sessionId, user.id, 'chunk');
      if (session && session.getInt('size') === size && session.getString('status') === 'open' && !lib.isExpired(session)) {
        return { session_id: sessionId, uploaded: lib.storedChunks(session) };
      }
      if (session) {
        lib.removeChunkDir(session);
        $app.delete(session);
      }
      session = fn.newRecord($app, lib.SESSIONS, {
        session_id: sessionId, file_name: name, size, total_chunks: Math.ceil(size / lib.CHUNK_SIZE), part_size: lib.CHUNK_SIZE,
        storage: 'chunk', status: 'open', created_by: user.id, expires_at: lib.pbDate(lib.SESSION_TTL_MS),
        uploaded_indices: [], parts_json: '[]', final_file_url: '',
      });
      $app.save(session);
      return { session_id: sessionId, uploaded: [] };
    }

    const session = lib.findSession(sessionId, user.id, 'chunk');
    if (!session) throw new fn.HttpError(404, 'session inconnue — relancer init');

    if (action === 'chunk') {
      if (session.getString('status') !== 'open' || lib.isExpired(session)) throw new fn.HttpError(409, 'session fermée ou expirée — relancer init');
      const index = Number(field('index'));
      const total = session.getInt('total_chunks');
      if (!Number.isInteger(index) || index < 0 || index >= total) throw new fn.HttpError(400, 'index de morceau invalide');
      if (!uploaded.length || !uploaded[0]) throw new fn.HttpError(400, 'champs manquants (session_id, index, chunk)');
      const expected = lib.expectedSize(total, session.getInt('size'), lib.CHUNK_SIZE, index, 0);
      if (uploaded[0].size !== expected) throw new fn.HttpError(400, `taille du morceau ${index} incorrecte`);
      lib.writeChunk(session, index, uploaded[0]);
      return { success: true, index, uploaded: lib.storedChunks(session).length, total };
    }

    if (action === 'finalize') {
      if (session.getString('status') === 'done' && session.getString('final_file_url')) {
        return { success: true, file_url: session.getString('final_file_url') };
      }
      // Passage à « finalizing » atomique : un second appel simultané reçoit 409.
      fn.tx((txApp) => {
        const s = txApp.findRecordById(lib.SESSIONS, session.id);
        if (s.getString('status') !== 'open') return fn.fail(409, 'assemblage déjà en cours — réessayez dans quelques secondes');
        s.set('status', 'finalizing');
        txApp.save(s);
        return fn.ok(true);
      });
      const fail = (status, message) => {
        session.set('status', 'open');
        $app.save(session);
        return new fn.HttpError(status, message);
      };
      const total = session.getInt('total_chunks');
      const have = lib.storedChunks(session);
      if (have.length !== total) {
        const missing = [];
        for (let i = 0; i < total && missing.length < 20; i++) if (have.indexOf(i) < 0) missing.push(i);
        throw fail(400, `morceaux manquants : ${missing.join(',')}`);
      }
      const path = lib.assembleChunks(session);
      const file = $filesystem.fileFromPath(path);
      file.name = lib.randomFileName(session.getString('file_name'), 'bin');
      const rec = fn.newRecord($app, 'FichierAdmin', { proprietaire: user.id, usage: '' });
      rec.set('fichier', file);
      try {
        $app.save(rec);
      } catch (err) {
        lib.removeChunkDir(session);
        session.set('status', 'error');
        $app.save(session);
        const msg = String(err);
        if (/mime|type/i.test(msg)) throw new fn.HttpError(415, 'Type de fichier non autorisé');
        if (/size|large/i.test(msg)) throw new fn.HttpError(413, 'Fichier trop volumineux (max 100 Mo)');
        throw new fn.HttpError(400, 'Fichier refusé');
      }
      const url = lib.fileUrl(lib.publicBaseUrl(e), rec);
      lib.removeChunkDir(session);
      session.set('status', 'done');
      session.set('final_file_url', url);
      $app.save(session);
      return { success: true, file_url: url };
    }

    throw new fn.HttpError(400, 'action inconnue');
  });
});

// ── R2 multipart : vidéos > 100 Mo (admin, 5 Go max, vidéo seulement) ───────
routerAdd('POST', '/api/fn/initMultipartUpload', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'initMultipartUpload', 'Échec de l’initialisation du téléversement', () => {
    const user = fn.requireAdmin(e, 'Unauthorized: admin requis');
    const body = fn.readBody(e);
    const sessionId = lib.requireSessionId(body);
    const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 200) : '';
    const fileSize = Number(body.fileSize);
    const fileType = typeof body.fileType === 'string' ? body.fileType.toLowerCase() : '';
    if (!Number.isInteger(fileSize) || fileSize <= 0) throw new fn.HttpError(400, 'fileSize invalide');
    if (fileSize > lib.MAX_VIDEO_BYTES) throw new fn.HttpError(413, 'Fichier trop volumineux (max 5 Go)');
    const ext = lib.extensionOf(fileName, '');
    if (lib.VIDEO_EXT.indexOf(ext) < 0 || (fileType && fileType.indexOf('video/') !== 0)) {
      throw new fn.HttpError(415, 'Seules les vidéos (mp4, mov, m4v, webm, mkv) peuvent être envoyées vers le stockage vidéo');
    }
    const cfg = lib.requireR2();
    const totalParts = Math.ceil(fileSize / lib.PART_SIZE);

    // session_id du client = base64(nom:taille:date) TRONQUÉ à 48 caractères : deux fichiers de même nom
    // et taille peuvent le partager. Empreinte complète (nom, taille, date de modification) gardée dans
    // le champ « name » : reprise ou « déjà envoyé » seulement si elle est identique.
    const fingerprint = `${fileName}|${fileSize}|${Number(body.lastModified) || 0}`.slice(0, 300);
    const existing = lib.findSession(sessionId, user.id, 's3-multipart');
    const same = existing && existing.getString('name') === fingerprint;
    if (same && existing.getString('status') === 'done' && existing.getString('final_file_url')) {
      return { session_id: sessionId, uploadId: '', key: existing.getString('s3_key'), file_url: existing.getString('final_file_url'), already_done: true };
    }
    if (same && existing.getString('status') === 'open' && !lib.isExpired(existing) && existing.getInt('size') === fileSize) {
      return {
        session_id: sessionId, uploadId: existing.getString('upload_id'), key: existing.getString('s3_key'),
        partSize: existing.getInt('part_size'), totalParts: existing.getInt('total_chunks'), resumed: true,
      };
    }
    if (existing) {
      if (existing.getString('upload_id') && existing.getString('status') !== 'done') {
        lib.abortMultipart(cfg, existing.getString('s3_key'), existing.getString('upload_id'));
      }
      $app.delete(existing);
    }

    // Clé imposée par le serveur (le nom du client ne sert qu'au slug lisible).
    const now = new Date();
    const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `${cfg.prefix}/${month}/${$security.randomStringWithAlphabet(16, 'abcdefghijklmnopqrstuvwxyz0123456789')}-${lib.slug(fileName)}.${ext}`;
    const uploadId = lib.createMultipart(cfg, key, lib.VIDEO_TYPES[ext]);
    $app.save(fn.newRecord($app, lib.SESSIONS, {
      session_id: sessionId, name: fingerprint, file_name: fileName, mime_type: lib.VIDEO_TYPES[ext], size: fileSize, total_chunks: totalParts,
      part_size: lib.PART_SIZE, upload_id: uploadId, s3_key: key, storage: 's3-multipart', status: 'open',
      created_by: user.id, expires_at: lib.pbDate(lib.SESSION_TTL_MS), uploaded_indices: [], parts_json: '[]', final_file_url: '',
    }));
    return { session_id: sessionId, uploadId, key, partSize: lib.PART_SIZE, totalParts };
  });
});

routerAdd('POST', '/api/fn/getPresignedUrl', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'getPresignedUrl', 'Échec de la préparation de l’envoi', () => {
    const user = fn.requireAdmin(e, 'Unauthorized: admin requis');
    const body = fn.readBody(e);
    const sessionId = lib.requireSessionId(body);
    const cfg = lib.requireR2();
    const session = lib.findSession(sessionId, user.id, 's3-multipart');

    if (body.action === 'status') {
      if (!session) throw new fn.HttpError(404, 'session inconnue');
      if (session.getString('status') === 'done' && session.getString('final_file_url')) {
        return { done: true, file_url: session.getString('final_file_url'), uploaded: [], missing: [], parts: [] };
      }
      const parts = lib.listParts(cfg, session.getString('s3_key'), session.getString('upload_id'));
      if (parts === null) return { error: 'téléversement expiré', expired: true, uploaded: [], missing: [], parts: [] };
      const total = session.getInt('total_chunks');
      const size = session.getInt('size');
      const good = parts.filter((p) => p.partNumber >= 1 && p.partNumber <= total
        && p.size === lib.expectedSize(total, size, session.getInt('part_size'), p.partNumber, 1));
      const uploaded = good.map((p) => p.partNumber);
      const missing = [];
      for (let n = 1; n <= total; n++) if (uploaded.indexOf(n) < 0) missing.push(n);
      return { uploaded, missing, parts: good.map((p) => ({ partNumber: p.partNumber, etag: p.etag })), partSize: session.getInt('part_size'), totalParts: total };
    }

    if (!session || session.getString('status') !== 'open' || lib.isExpired(session)) {
      throw new fn.HttpError(404, 'session inconnue ou expirée — relancer initMultipartUpload');
    }
    if (body.uploadId !== session.getString('upload_id') || body.key !== session.getString('s3_key')) {
      throw new fn.HttpError(400, 'uploadId/key ne correspondent pas à la session');
    }
    const partNumber = Number(body.partNumber);
    const total = session.getInt('total_chunks');
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > total) throw new fn.HttpError(400, 'uploadId/key/partNumber invalides');
    const size = lib.expectedSize(total, session.getInt('size'), session.getInt('part_size'), partNumber, 1);
    const presignedUrl = lib.presignPart(cfg, session.getString('s3_key'), session.getString('upload_id'), partNumber, size);
    return { presignedUrl, expiresIn: lib.PRESIGN_TTL_SEC, partNumber, size };
  });
});

routerAdd('POST', '/api/fn/completeMultipartUpload', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'completeMultipartUpload', 'Échec de l’assemblage de la vidéo', () => {
    const user = fn.requireAdmin(e, 'Unauthorized: admin requis');
    const body = fn.readBody(e);
    const sessionId = lib.requireSessionId(body);
    const cfg = lib.requireR2();
    const session = lib.findSession(sessionId, user.id, 's3-multipart');
    if (!session) throw new fn.HttpError(404, 'session inconnue');
    if (session.getString('status') === 'done' && session.getString('final_file_url')) {
      return { success: true, file_url: session.getString('final_file_url'), key: session.getString('s3_key') };
    }
    if (body.uploadId !== session.getString('upload_id') || body.key !== session.getString('s3_key')) {
      throw new fn.HttpError(400, 'uploadId/key ne correspondent pas à la session');
    }
    fn.tx((txApp) => {
      const s = txApp.findRecordById(lib.SESSIONS, session.id);
      if (s.getString('status') !== 'open') return fn.fail(409, `session non finalisable (status=${s.getString('status')})`);
      s.set('status', 'finalizing');
      txApp.save(s);
      return fn.ok(true);
    });
    const reopen = (status, message) => {
      const s = $app.findRecordById(lib.SESSIONS, session.id);
      s.set('status', 'open');
      $app.save(s);
      return new fn.HttpError(status, message);
    };
    const key = session.getString('s3_key');
    const total = session.getInt('total_chunks');
    const size = session.getInt('size');
    // Les parts viennent de R2 (ListParts), pas du client : tailles et ETags vérifiés côté serveur.
    const parts = lib.listParts(cfg, key, session.getString('upload_id'));
    if (parts === null) throw reopen(410, 'téléversement expiré — relancer initMultipartUpload');
    const byNumber = {};
    for (const p of parts) byNumber[p.partNumber] = p;
    const finalParts = [];
    for (let n = 1; n <= total; n++) {
      const p = byNumber[n];
      if (!p || p.size !== lib.expectedSize(total, size, session.getInt('part_size'), n, 1)) {
        throw reopen(400, `parts manquantes ou de taille incorrecte (${finalParts.length}/${total} valides)`);
      }
      finalParts.push(p);
    }
    lib.completeMultipart(cfg, key, session.getString('upload_id'), finalParts);
    // Type réel : premiers octets de l'objet assemblé.
    if (!lib.looksLikeVideo(lib.headBytes(cfg, key))) {
      lib.deleteObject(cfg, key);
      const s = $app.findRecordById(lib.SESSIONS, session.id);
      s.set('status', 'error');
      $app.save(s);
      throw new fn.HttpError(415, 'Le contenu envoyé n’est pas une vidéo : fichier supprimé');
    }
    const url = lib.objectUrl(cfg, key);
    const s = $app.findRecordById(lib.SESSIONS, session.id);
    s.set('status', 'done');
    s.set('final_file_url', url);
    s.set('parts_json', JSON.stringify(finalParts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }))));
    $app.save(s);
    return {
      success: true, file_url: url, key, size, name: session.getString('file_name'),
      mime_type: session.getString('mime_type'), storage: 's3-multipart',
    };
  });
});

// ── Nettoyages ───────────────────────────────────────────────────────────────
routerAdd('POST', '/api/fn/cleanupIncompleteUploads', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'cleanupIncompleteUploads', 'Échec du nettoyage', () => {
    if (!e.hasSuperuserAuth()) fn.requireAdmin(e, 'Unauthorized: admin requis');
    return Object.assign({ success: true }, lib.cleanupIncomplete());
  });
});

routerAdd('POST', '/api/fn/cleanupOrphanFiles', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const lib = require(`${__hooks}/lib/televersement.js`);
  return fn.run(e, 'cleanupOrphanFiles', 'Échec du nettoyage', () => {
    if (!e.hasSuperuserAuth()) throw new fn.HttpError(403, 'Réservé au superuser');
    const body = fn.readBody(e);
    const grace = body.graceHours === undefined ? 168 : Number(body.graceHours);
    if (!(grace >= 0 && grace <= 24 * 365)) throw new fn.HttpError(400, 'graceHours invalide');
    // limiterA : restreint l'examen à ces identifiants (tests : ne jamais toucher aux autres fichiers).
    const only = Array.isArray(body.limiterA) ? body.limiterA.filter((x) => typeof x === 'string').slice(0, 1000) : null;
    return Object.assign({ success: true }, lib.cleanupOrphans(grace, body.simulation !== false, only));
  });
});

cronAdd('televersements_incomplets', '17 * * * *', () => {
  const lib = require(`${__hooks}/lib/televersement.js`);
  const r = lib.cleanupIncomplete();
  if (r.sessions_supprimees || r.uploads_abandonnes || r.dossiers_supprimes || r.erreurs) {
    $app.logger().info('[fichiers] téléversements incomplets nettoyés', 'sessions', r.sessions_supprimees, 'r2', r.uploads_abandonnes, 'dossiers', r.dossiers_supprimes, 'erreurs', r.erreurs);
  }
});

// Fichiers non référencés depuis plus de 7 jours. FICHIERS_NETTOYAGE : "simulation" (défaut, aussi si absente
// ou invalide) = compte seulement ; "actif" = supprime vraiment.
cronAdd('fichiers_orphelins', '30 3 * * 0', () => {
  const lib = require(`${__hooks}/lib/televersement.js`);
  const actif = String($os.getenv('FICHIERS_NETTOYAGE') || '').trim().toLowerCase() === 'actif';
  const r = lib.cleanupOrphans(168, !actif);
  $app.logger().info('[fichiers] fichiers non référencés', 'mode', actif ? 'actif' : 'simulation', 'examines', r.examines,
    'orphelins', r.orphelins, 'supprimes', r.supprimes, 'annule', r.annule);
});
