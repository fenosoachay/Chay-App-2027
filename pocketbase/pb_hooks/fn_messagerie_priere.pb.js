// Bloc 2, lot 2 : messagerie et prière.
// Reproduit base44/functions/{createMessage, createPrayerRequest, takePrayer, answerPrayer}/entry.ts.
// Appelant identifié uniquement par e.auth. Notifications (in-app, e-mail, push) : lib/notifications.js (bloc 5).

// ── createMessage ─────────────────────────────────────────────────────────────
// Participants et expéditeur forcés côté serveur ; l'appelant doit être participant.
routerAdd('POST', '/api/fn/createMessage', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createMessage', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const imageUrl = typeof body.image_url === 'string' ? body.image_url : '';
    const replyToId = typeof body.reply_to_id === 'string' && body.reply_to_id ? body.reply_to_id : null;
    // 1.3.35 : pièce jointe (vocal, vidéo, audio, document, fichier) envoyée juste avant par CE membre vers R2
    // (usage « message ») : nom, type et taille viennent de sa session de téléversement, jamais du client.
    const pj = body.piece_jointe && typeof body.piece_jointe === 'object' ? body.piece_jointe : null;
    let pieceJointe = null;
    if (pj) {
      const url = typeof pj.url === 'string' ? pj.url : '';
      if (!url || url.length > 2000) throw new fn.HttpError(400, 'Pièce jointe invalide');
      const lib = require(`${__hooks}/lib/televersement.js`);
      const session = fn.findOne($app, lib.SESSIONS, 'final_file_url = {:url} && created_by = {:u} && storage = {:t} && status = "done"', '-created',
        { url, u: caller.id, t: lib.STORAGE_MESSAGE });
      if (!session) throw new fn.HttpError(400, 'Pièce jointe introuvable : renvoyez le fichier.');
      const mime = session.getString('mime_type');
      const msg = require(`${__hooks}/lib/messagesPieces.js`);
      pieceJointe = msg.pieceJointe({
        url, nom: session.getString('file_name'), mime, taille: session.getInt('size'),
        vocal: pj.vocal === true, duree: pj.duree,
      });
    }
    if (!conversationId || (!text && !imageUrl && !pieceJointe)) {
      throw new fn.HttpError(400, 'conversation_id et text ou image_url requis');
    }
    if (conversationId.length > 64 || text.length > 20000 || imageUrl.length > 2000 || (replyToId && replyToId.length > 64)) {
      throw new fn.HttpError(400, 'Requête invalide');
    }

    const conversation = fn.findById('Conversation', conversationId);
    if (!conversation) throw new fn.HttpError(404, 'conversation not found');
    const participants = fn.plain(conversation).participant_ids;
    const list = Array.isArray(participants) ? participants : [];
    if (list.indexOf(caller.id) === -1) throw new fn.HttpError(403, 'Forbidden');
    // Messages automatiques du compte « Chay » (1.3.22) : on ne peut pas y répondre.
    const systeme = require(`${__hooks}/lib/signalements.js`).idsSysteme($app);
    if (systeme.indexOf(caller.id) === -1 && list.some((id) => systeme.indexOf(id) !== -1)) {
      throw new fn.HttpError(403, 'On ne peut pas répondre aux messages automatiques de Chay.');
    }

    // 1.3.35 : envoi déjà reçu (même clé, réponse perdue puis renvoi depuis la file d'attente) : pas de doublon.
    const cle = typeof body.cle_envoi === 'string' && /^[A-Za-z0-9]{8,64}$/.test(body.cle_envoi) ? `${caller.id}:${body.cle_envoi}` : '';
    const envois = (() => { try { return JSON.parse($app.store().get('cles_envoi') || '{}') || {}; } catch (_) { return {}; } })();
    const deja = cle && envois[cle];
    if (deja && Date.now() - deja.t < 24 * 3600 * 1000) {
      return { id: deja.id, created_date: deja.date, notification_error: null, notification_info: null, piece_jointe: pieceJointe, deja_recu: true };
    }

    const myName = [caller.getString('first_name'), caller.getString('last_name')].filter(Boolean).join(' ')
      || caller.getString('name')
      || 'Membre';
    const message = fn.newRecord($app, 'Message', {
      conversation_id: conversationId,
      participant_ids: list,
      sender_id: caller.id,
      sender_name: myName,
      text,
      image_url: imageUrl || '',
      piece_jointe: pieceJointe,
      reply_to_id: replyToId || '',
      read_by: [caller.id],
      created_by_id: caller.id,
    });
    $app.save(message);
    if (cle) {
      const maintenant = Date.now();
      for (const k of Object.keys(envois)) if (maintenant - envois[k].t >= 24 * 3600 * 1000) delete envois[k];
      envois[cle] = { id: message.id, t: maintenant, date: fn.createdDate(fn.plain(message)) };
      $app.store().set('cles_envoi', JSON.stringify(envois));
    }

    // sendMessagePush : in-app + e-mail + push (idempotent ; les push en échec temporaire sont remis en file).
    // notification_error : vrais échecs seulement ; notification_info : envoi retenu par NOTIFICATIONS_MODE
    // ou destinataire sans appareil abonné (la notification in-app est créée dans ces deux cas).
    let notificationError = null;
    let notificationInfo = null;
    try {
      const notif = require(`${__hooks}/lib/notifications.js`);
      const dispatch = notif.messagePush(message);
      notificationError = notif.messageNotificationError(dispatch);
      notificationInfo = notif.messageNotificationInfo(dispatch);
    } catch (_) {
      notificationError = 'notification_dispatch_failed';
      $app.logger().error('[createMessage] message enregistré, notifications impossibles');
    }

    return {
      id: message.id,
      created_date: fn.createdDate(fn.plain(message)),
      piece_jointe: pieceJointe,
      notification_error: notificationError,
      notification_info: notificationInfo,
    };
  });
});

// ── reactMessage (1.3.36) ─────────────────────────────────────────────────────
// Réaction à un message (❤️ 😆 😮 😢 😠 👍), comme Messenger. L'appelant doit être participant ; il ne
// change que SA réaction. L'auteur du message est prévenu (push), au plus une fois par message et par personne
// en 10 minutes (pas de rafale si l'on change d'avis).
routerAdd('POST', '/api/fn/reactMessage', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'reactMessage', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const body = fn.readBody(e);
    const lib = require(`${__hooks}/lib/reactionsMessages.js`);
    const id = typeof body.message_id === 'string' && body.message_id.length <= 64 ? body.message_id : '';
    const emoji = typeof body.emoji === 'string' ? body.emoji : '';
    if (!id || !lib.valide(emoji)) throw new fn.HttpError(400, 'Réaction invalide');
    const message = fn.findById('Message', id);
    if (!message) throw new fn.HttpError(404, 'Message introuvable');
    const m = fn.plain(message);
    const participants = Array.isArray(m.participant_ids) ? m.participant_ids : [];
    if (participants.indexOf(caller.id) === -1) throw new fn.HttpError(403, 'Forbidden');
    const avant = m.reactions && typeof m.reactions === 'object' ? m.reactions : {};
    const apres = lib.appliquer(avant, caller.id, emoji);
    message.set('reactions', apres);
    $app.save(message);

    // Push à l'auteur (pas à soi-même), si une réaction est ajoutée.
    const auteur = m.sender_id;
    if (apres[caller.id] && auteur && auteur !== caller.id) {
      try {
        // 1.3.42 : chaque réaction prévient l'auteur (plus de limite de 10 minutes).
        {
          const notif = require(`${__hooks}/lib/notifications.js`);
          const dest = notif.activeUser(auteur);
          const s = notif.settingsOf(dest);
          if (dest && s.notif_messages !== false) {
            const prenom = caller.getString('first_name') || caller.getString('name') || 'Quelqu\'un';
            const extrait = String(m.text || '').slice(0, 60);
            notif.pushToAllowed([auteur], {
              title: prenom,
              body: `a réagi ${apres[caller.id]} à votre message${extrait ? ` : « ${extrait} »` : ''}`,
              target_type: 'message', target_id: m.conversation_id,
            }, 'reactMessage');
          }
        }
      } catch (_) {
        $app.logger().error('[reactMessage] push impossible');
      }
    }
    return { id, reactions: apres };
  });
});

// ── createPrayerRequest ───────────────────────────────────────────────────────
// 3 demandes maximum par jour calendaire (UTC) ; auteur forcé côté serveur ; statut "open".
routerAdd('POST', '/api/fn/createPrayerRequest', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createPrayerRequest', 'Erreur interne', () => {
    const MAX_PER_DAY = 3;
    const CATEGORIES = ['Santé', 'Famille', 'Travail', 'Guidance', 'Autre'];
    const caller = fn.requireUser(e, 'Connexion requise.');
    const body = fn.readBody(e);
    const category = typeof body.category === 'string' ? body.category : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (CATEGORIES.indexOf(category) === -1) throw new fn.HttpError(400, 'Catégorie invalide.');
    if (!content) throw new fn.HttpError(400, 'Le sujet de prière est obligatoire.');
    if (content.length > 300) throw new fn.HttpError(400, 'Le sujet dépasse 300 caractères.');

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);
    const pbDate = (d) => d.toISOString().replace('T', ' ');

    // Comptage + création dans la même transaction : pas de dépassement par requêtes simultanées.
    return fn.tx((txApp) => {
      const today = txApp.findRecordsByFilter('PrayerRequest',
        'requester_id = {:uid} && base44_created_date >= {:start} && base44_created_date < {:end}',
        '', 10, 0, { uid: caller.id, start: pbDate(start), end: pbDate(end) });
      if (today.length >= MAX_PER_DAY) {
        return fn.fail(429, `Tu as atteint la limite de ${MAX_PER_DAY} demandes de prière aujourd'hui.`, { limit_reached: true });
      }
      const rec = fn.newRecord(txApp, 'PrayerRequest', { requester_id: caller.id, category, content, status: 'open' });
      txApp.save(rec);
      return fn.ok({ id: rec.id, today_remaining: MAX_PER_DAY - today.length - 1 });
    });
  });
});

// ── takePrayer ────────────────────────────────────────────────────────────────
routerAdd('POST', '/api/fn/takePrayer', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'takePrayer', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise.');
    const body = fn.readBody(e);
    const prayerId = typeof body.prayer_id === 'string' && body.prayer_id.length <= 64 ? body.prayer_id : '';
    if (!prayerId) throw new fn.HttpError(400, 'Prière introuvable.');

    const result = fn.tx((txApp) => {
      let prayer = null;
      try { prayer = txApp.findRecordById('PrayerRequest', prayerId); } catch (_) { prayer = null; }
      if (!prayer) return fn.fail(404, 'Prière introuvable.');
      if (prayer.getString('requester_id') === caller.id) {
        return fn.fail(403, 'Tu ne peux pas prendre en charge ta propre demande.');
      }
      // Lecture et écriture dans la même transaction : un seul intercesseur possible.
      if (prayer.getString('status') !== 'open') return fn.fail(409, 'Cette prière a déjà été prise en charge.');
      prayer.set('status', 'taken');
      prayer.set('taken_by', caller.id);
      prayer.set('taken_date', new DateTime());
      txApp.save(prayer);

      const requester = prayer.getString('requester_id');
      if (requester) {
        const nid = `prayer_taken_${prayerId}`;
        if (!fn.findOne(txApp, 'UserNotification', 'user_id = {:u} && notification_id = {:n}', '', { u: requester, n: nid })) {
          txApp.save(fn.newRecord(txApp, 'UserNotification', {
            user_id: requester,
            notification_id: nid,
            type: 'prayer_taken',
            content_type: 'prayer',
            content_id: prayerId,
            title: 'Quelqu\'un prie pour toi',
            message: 'Une personne a pris ta demande de prière en charge. Son identité reste anonyme.',
            is_read: false,
          }));
        }
      }
      return fn.ok({ ok: true, id: prayerId, status: 'taken' });
    });
    // Push au demandeur (best-effort, préférences respectées), comme Base44.
    try {
      const notif = require(`${__hooks}/lib/notifications.js`);
      const prayer = $app.findRecordById('PrayerRequest', prayerId);
      notif.pushToAllowed([prayer.getString('requester_id')], {
        title: "Quelqu'un prie pour toi",
        body: 'Une personne a pris ta demande de prière en charge. Son identité reste anonyme.',
        target_type: 'prayer',
        target_id: prayerId,
      }, 'takePrayer');
    } catch (_) {
      $app.logger().warn('[takePrayer] push impossible');
    }
    return result;
  });
});

// ── answerPrayer ──────────────────────────────────────────────────────────────
routerAdd('POST', '/api/fn/answerPrayer', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'answerPrayer', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Connexion requise.');
    const body = fn.readBody(e);
    const prayerId = typeof body.prayer_id === 'string' && body.prayer_id.length <= 64 ? body.prayer_id : '';
    if (!prayerId) throw new fn.HttpError(400, 'Prière introuvable.');

    const result = fn.tx((txApp) => {
      let prayer = null;
      try { prayer = txApp.findRecordById('PrayerRequest', prayerId); } catch (_) { prayer = null; }
      if (!prayer) return fn.fail(404, 'Prière introuvable.');
      if (prayer.getString('requester_id') !== caller.id) {
        return fn.fail(403, 'Seul le demandeur peut marquer cette prière comme exaucée.');
      }
      if (prayer.getString('status') !== 'taken') return fn.fail(409, 'Cette prière doit d\'abord être prise en charge.');
      prayer.set('status', 'answered');
      prayer.set('answered_date', new DateTime());
      txApp.save(prayer);

      const intercessor = prayer.getString('taken_by');
      if (intercessor) {
        const nid = `prayer_answered_${prayerId}`;
        if (!fn.findOne(txApp, 'UserNotification', 'user_id = {:u} && notification_id = {:n}', '', { u: intercessor, n: nid })) {
          txApp.save(fn.newRecord(txApp, 'UserNotification', {
            user_id: intercessor,
            notification_id: nid,
            type: 'prayer_answered',
            content_type: 'prayer',
            content_id: prayerId,
            title: 'Une prière que tu as prise en charge est exaucée',
            message: 'Le demandeur a marqué cette demande comme exaucée. Merci pour ta prière !',
            is_read: false,
          }));
        }
      }
      return fn.ok({ ok: true, id: prayerId, status: 'answered' });
    });
    // Push à l'intercesseur (best-effort, préférences respectées), comme Base44.
    try {
      const notif = require(`${__hooks}/lib/notifications.js`);
      const intercessor = $app.findRecordById('PrayerRequest', prayerId).getString('taken_by');
      if (intercessor) {
        notif.pushToAllowed([intercessor], {
          title: 'Une prière que tu as prise en charge est exaucée',
          body: 'Le demandeur a marqué cette demande comme exaucée. Merci pour ta prière !',
          target_type: 'prayer',
          target_id: prayerId,
        }, 'answerPrayer');
      }
    } catch (_) {
      $app.logger().warn('[answerPrayer] push impossible');
    }
    return result;
  });
});
