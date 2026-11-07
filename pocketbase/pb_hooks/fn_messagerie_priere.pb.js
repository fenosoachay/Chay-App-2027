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
    if (!conversationId || (!text && !imageUrl)) {
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

    const myName = caller.getString('name')
      || [caller.getString('first_name'), caller.getString('last_name')].filter(Boolean).join(' ')
      || 'Membre';
    const message = fn.newRecord($app, 'Message', {
      conversation_id: conversationId,
      participant_ids: list,
      sender_id: caller.id,
      sender_name: myName,
      text,
      image_url: imageUrl || '',
      reply_to_id: replyToId || '',
      read_by: [caller.id],
      created_by_id: caller.id,
    });
    $app.save(message);

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
      notification_error: notificationError,
      notification_info: notificationInfo,
    };
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
