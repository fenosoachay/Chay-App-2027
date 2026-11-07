// Bloc 5 : notifications push, e-mails et fonctions restantes.
// Reproduit base44/functions/{sendFcmPush, sendWebPush, sendMessagePush, notifyCommunityPost,
// notifySocialInteraction, notifyNewContent, notifyDailyVerse, sendTestNotification, createCommunityPost,
// createThemeRequest, handleThemeRequest}/entry.ts. Appelant identifié uniquement par e.auth ;
// plus d'internal_secret (les appels internes sont des appels JS). Voir docs/PUSH.md.


// ── sendFcmPush ──────────────────────────────────────────────────────────────
// Admin : user_ids quelconques. Membre : { test: true } vers lui-même seulement (5 par 10 min).
routerAdd('POST', '/api/fn/sendFcmPush', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'sendFcmPush', 'Erreur interne', () => {
    const push = require(`${__hooks}/lib/push.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    const caller = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    let userIds;
    if (body.test === true) {
      if (!notif.hit(`test_push:${caller.id}`, 5, 10 * 60 * 1000)) throw new fn.HttpError(429, 'Trop de tests, réessaie dans quelques minutes.');
      userIds = [caller.id];
    } else {
      if (caller.getString('role') !== 'admin') throw new fn.HttpError(403, 'Forbidden');
      userIds = Array.isArray(body.user_ids) ? body.user_ids.filter((id) => typeof id === 'string' && id && id.length <= 64) : [];
      if (userIds.length > 5000) throw new fn.HttpError(400, '5000 destinataires maximum');
    }
    if (!userIds.length) return { sent: 0, tokensFound: 0, failed: 0, firebaseResponses: [] };
    return push.sendToUsers(userIds, {
      title: String(body.title || 'Chay').slice(0, 100),
      body: String(body.body || '').slice(0, 100),
      target_type: body.target_type,
      target_id: body.target_id,
    }, 'sendFcmPush');
  });
});

// ── sendWebPush ──────────────────────────────────────────────────────────────
routerAdd('POST', '/api/fn/sendWebPush', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'sendWebPush', 'Erreur interne', () => {
    const push = require(`${__hooks}/lib/push.js`);
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const userIds = Array.isArray(body.user_ids) ? body.user_ids.filter((id) => typeof id === 'string' && id && id.length <= 64) : [];
    if (userIds.length > 5000) throw new fn.HttpError(400, '5000 destinataires maximum');
    if (!userIds.length) return { sent: 0, failed: 0, subscriptions: 0, byUser: [] };
    return push.sendWebToUsers(userIds, {
      title: String(body.title || 'ÉGLISE CHAY').slice(0, 100),
      body: String(body.body || '').slice(0, 300),
      target_type: body.target_type,
      target_id: body.target_id,
    });
  });
});

// ── sendMessagePush (admin ; appelé en interne par createMessage) ────────────
routerAdd('POST', '/api/fn/sendMessagePush', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'sendMessagePush', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const messageId = fn.requireString(body, 'message_id', 'message_id required', 64);
    const message = fn.findById('Message', messageId);
    if (!message) throw new fn.HttpError(404, 'message not found');
    return notif.messagePush(message);
  });
});

// ── notifyCommunityPost (admin ou auteur ; idempotent) ───────────────────────
routerAdd('POST', '/api/fn/notifyCommunityPost', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'notifyCommunityPost', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const caller = fn.requireUser(e, 'Forbidden');
    const body = fn.readBody(e);
    const postId = fn.requireString(body, 'post_id', 'post_id required', 64);
    const post = fn.findById('CommunityPost', postId);
    if (!post) throw new fn.HttpError(404, 'post not found');
    if (caller.getString('role') !== 'admin' && post.getString('created_by_id') !== caller.id) throw new fn.HttpError(403, 'Forbidden');
    return notif.communityPostNotify(post);
  });
});

// ── notifySocialInteraction ──────────────────────────────────────────────────
// Destinataire = auteur de la publication (déduit côté serveur) ; « j'aime » / commentaire vérifiés.
routerAdd('POST', '/api/fn/notifySocialInteraction', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'notifySocialInteraction', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const push = require(`${__hooks}/lib/push.js`);
    const user = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    const action = body.action;
    const postId = typeof body.post_id === 'string' && body.post_id.length <= 64 ? body.post_id : '';
    const actorId = typeof body.actor_id === 'string' ? body.actor_id : '';
    if (!action || !postId || !actorId) throw new fn.HttpError(400, 'missing fields');
    if (actorId !== user.id) throw new fn.HttpError(403, 'actor mismatch');
    const post = fn.findById('CommunityPost', postId);
    if (!post) throw new fn.HttpError(404, 'post not found');
    const authorId = post.getString('created_by_id');
    const actorName = notif.displayName(user) || (user.email() ? user.email().split('@')[0] : 'Quelqu\'un');
    if (authorId === actorId) return { skipped: 'self' };

    const author = notif.activeUser(authorId);
    if (!author) return { skipped: 'author_not_found' };
    const prefs = notif.settingsOf(author);
    if (prefs.notifications_enabled === false) return { skipped: 'notifications_disabled' };
    if (action === 'like' && prefs.notif_likes === false) return { skipped: 'pref_likes' };
    if (action === 'comment' && prefs.notif_comments === false) return { skipped: 'pref_comments' };
    const sendPush = (key, max, windowMs, title, message) => {
      if (prefs.notif_push === false) return { skipped: 'push_disabled' };
      if (!notif.hit(key, max, windowMs)) return { skipped: 'rate_limited' };
      return push.sendToUsers([authorId], { title, body: message, target_type: 'community', target_id: postId }, 'notifySocialInteraction');
    };

    if (action === 'like') {
      if (!fn.findOne($app, 'PostReaction', 'post_id = {:p} && user_id = {:u} && created_by_id = {:u}', '', { p: postId, u: actorId })) {
        throw new fn.HttpError(404, 'like not found');
      }
      const list = $app.findRecordsByFilter('UserNotification', "user_id = {:a} && type = 'like' && post_id = {:p} && is_read = false",
        '-created', 50, 0, { a: authorId, p: postId });
      const total = list.reduce((s, n) => s + (n.getInt('count') || 1), 0) + 1;
      const firstActor = (list[0] && list[0].getString('actor_name')) || actorName;
      const title = total > 1
        ? `${firstActor} et ${total - 1} autre${total - 1 > 1 ? 's' : ''} ont aimé votre publication`
        : `${actorName} a aimé votre publication`;
      if (list[0]) {
        list[0].set('count', total);
        list[0].set('title', title);
        list[0].set('actor_name', firstActor);
        $app.save(list[0]);
      } else {
        notif.createNotifications([{
          user_id: authorId, notification_id: `like_${postId}`, type: 'like', post_id: postId, actor_id: actorId,
          actor_name: actorName, count: 1, title, is_read: false,
        }], 'notifySocialInteraction');
      }
      // Un push « j'aime » par (membre, publication) et par 24 h : retirer / remettre un j'aime ne spamme pas l'auteur.
      const p = sendPush(`like:${actorId}:${postId}`, 1, 24 * 3600 * 1000, title,
        actorName + (total > 1 ? ' et d\'autres ont aimé votre publication.' : ' a aimé votre publication.'));
      return { ok: true, action: 'like', total, push: p };
    }

    if (action === 'comment') {
      const commentId = typeof body.comment_id === 'string' && body.comment_id.length <= 64 ? body.comment_id : '';
      if (!commentId) throw new fn.HttpError(400, 'comment_id required');
      const comment = fn.findById('Comment', commentId);
      if (!comment || comment.getString('post_id') !== postId || comment.getString('created_by_id') !== actorId) {
        throw new fn.HttpError(404, 'comment not found');
      }
      const notifId = `comment_${commentId}`;
      if (notif.notificationExists(notifId, authorId)) return { ok: true, action: 'comment', skipped: 'already_notified' };
      const excerpt = String(comment.getString('text') || '').slice(0, 40);
      const title = `${actorName} a commenté votre publication`;
      notif.createNotifications([{
        user_id: authorId, notification_id: notifId, type: 'comment', post_id: postId, actor_id: actorId,
        actor_name: actorName, count: 1, title, message: excerpt, is_read: false,
      }], 'notifySocialInteraction');
      const p = sendPush(`comment:${actorId}`, 30, 3600 * 1000, title, excerpt || title);
      return { ok: true, action: 'comment', push: p };
    }

    throw new fn.HttpError(400, 'unknown action');
  });
});

// ── notifyNewContent (admin) ─────────────────────────────────────────────────
routerAdd('POST', '/api/fn/notifyNewContent', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'notifyNewContent', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const contentId = fn.requireString(body, 'content_id', 'content_id required', 64);
    const content = fn.findById('Content', contentId);
    if (!content) throw new fn.HttpError(404, 'content not found');
    return notif.newContentNotify(content, body.send_email !== false);
  });
});

// ── notifyDailyVerse (admin ; tâche planifiée verset_du_jour) ────────────────
routerAdd('POST', '/api/fn/notifyDailyVerse', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'notifyDailyVerse', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    fn.requireAdmin(e, 'Forbidden');
    return notif.dailyVerse(Date.now(), false);
  });
});

// ── sendTestNotification (admin : notification + e-mail à soi-même) ─────────
routerAdd('POST', '/api/fn/sendTestNotification', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'sendTestNotification', 'Erreur interne', () => {
    const mail = require(`${__hooks}/lib/courriel.js`);
    const notif = require(`${__hooks}/lib/notifications.js`);
    const user = fn.requireAdmin(e, 'Forbidden');
    let notifCreated = false;
    let notifId = null;
    let notifError = null;
    try {
      const n = fn.newRecord($app, 'UserNotification', {
        user_id: user.id,
        notification_id: `test_${user.id}_${Date.now()}`,
        type: 'new_content',
        title: 'Notification de test',
        message: 'Ceci est une notification de test envoyée par l\'administrateur.',
        content_type: 'test',
        is_read: false,
      });
      $app.save(n);
      notifCreated = true;
      notifId = n.id;
    } catch (_) {
      notifError = 'création impossible';
    }
    let emailSent = false;
    let emailError = null;
    const to = user.email();
    if (to) {
      const name = notif.displayName(user);
      const html = mail.shell('Notification de test',
        mail.paragraph(`Bonjour ${mail.escapeHtml(name)},`)
        + mail.paragraph('Ceci est un e-mail de test du système de notifications de l\'Église Chay. Si vous le recevez, l\'envoi d\'e-mails fonctionne correctement.')
        + mail.button(mail.appUrl() || '/', 'Ouvrir l\'application'));
      try {
        emailSent = mail.send(to, 'Notification de test — Église Chay', html,
          `Bonjour ${name},\n\nCeci est un e-mail de test du système de notifications de l'Église Chay.`);
        if (!emailSent) emailError = `bloqué par NOTIFICATIONS_MODE (${require(`${__hooks}/lib/sortie.js`).mode()})`;
      } catch (_) {
        emailError = 'envoi impossible (voir les réglages SMTP)';
      }
    }
    return {
      notification: { created: notifCreated, id: notifId, error: notifError },
      email: { sent: emailSent, to: to || null, error: emailError },
    };
  });
});

// ── createCommunityPost ──────────────────────────────────────────────────────
// Auteur forcé côté serveur. Notification à toute la communauté : 3 publications par heure au plus
// pour un membre non admin (au-delà, publication créée sans notification).
routerAdd('POST', '/api/fn/createCommunityPost', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createCommunityPost', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const caller = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const okUrl = (u) => typeof u === 'string' && u.trim() && u.length <= 2048 && /^https?:\/\//i.test(u.trim());
    const list = Array.isArray(body.image_urls) ? body.image_urls.filter((u) => typeof u === 'string' && u.trim()) : [];
    if (list.length > 10 || list.some((u) => !okUrl(u))) throw new fn.HttpError(400, 'images invalides');
    const legacy = typeof body.image_url === 'string' && body.image_url.trim() ? body.image_url : null;
    if (legacy && !okUrl(legacy)) throw new fn.HttpError(400, 'images invalides');
    const all = [];
    for (const u of list.concat(legacy ? [legacy] : [])) if (all.indexOf(u) === -1) all.push(u);
    if (!text && !all.length) throw new fn.HttpError(400, 'text requis');
    if (text.length > 5000) throw new fn.HttpError(400, 'texte trop long');

    const post = fn.newRecord($app, 'CommunityPost', {
      text,
      image_url: legacy || all[0] || '',
      image_urls: all,
      author_name: notif.displayName(caller) || 'Membre',
      likes: 0,
      created_by_id: caller.id,
    });
    $app.save(post);

    // notification_error : vrais échecs seulement (l'app affiche alors « Les notifications aux autres utilisateurs
    // n'ont pas pu être envoyées »). Au-delà de 3 publications par heure (membre), la publication est créée sans
    // notification : c'est une limite VOULUE, pas un échec -> notification_info = 'rate_limited'.
    let notificationError = null;
    let notificationInfo = null;
    const recent = $app.findRecordsByFilter('CommunityPost', 'created_by_id = {:u} && created >= {:since}', '', 10, 0,
      { u: caller.id, since: notif.pbDate(Date.now() - 3600 * 1000) }).length;
    if (caller.getString('role') !== 'admin' && recent > 3) {
      notificationInfo = 'rate_limited';
    } else {
      try {
        notif.communityPostNotify(post);
      } catch (_) {
        notificationError = 'notification_dispatch_failed';
      }
    }
    return { id: post.id, notification_error: notificationError, notification_info: notificationInfo };
  });
});

// ── createThemeRequest ───────────────────────────────────────────────────────
routerAdd('POST', '/api/fn/createThemeRequest', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createThemeRequest', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const caller = fn.requireUser(e, 'Connexion requise.');
    const body = fn.readBody(e);
    const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
    const passage = typeof body.passage === 'string' ? body.passage.trim().slice(0, 200) : '';
    if (!theme) throw new fn.HttpError(400, 'Le thème est obligatoire.');
    if (theme.length > 500) throw new fn.HttpError(400, 'Le thème dépasse 500 caractères.');
    const request = fn.tx((txApp) => {
      const today = txApp.findRecordsByFilter('ThemeRequest', 'user_id = {:u} && created >= {:since}', '', 10, 0,
        { u: caller.id, since: notif.pbDate(Date.now() - 24 * 3600 * 1000) });
      if (today.length >= 10) return fn.fail(429, 'Tu as atteint la limite de 10 demandes de thème par jour.', { limit_reached: true });
      const rec = fn.newRecord(txApp, 'ThemeRequest', { user_id: caller.id, theme, passage, status: 'pending', created_by_id: caller.id });
      txApp.save(rec);
      return fn.ok(rec);
    });
    const recipients = notif.themeRequestCreated(request, theme);
    return { id: request.id, recipients };
  });
});

// ── handleThemeRequest (admins désignés) ─────────────────────────────────────
routerAdd('POST', '/api/fn/handleThemeRequest', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'handleThemeRequest', 'Erreur interne', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    const caller = fn.requireUser(e, 'Connexion requise.');
    const body = fn.readBody(e);
    const requestId = typeof body.request_id === 'string' && body.request_id.length <= 64 ? body.request_id : '';
    const decision = body.decision;
    const note = typeof body.admin_note === 'string' ? body.admin_note.trim().slice(0, 500) : '';
    if (!requestId) throw new fn.HttpError(400, 'Demande introuvable.');
    if (decision !== 'validated' && decision !== 'declined') throw new fn.HttpError(400, 'Décision invalide.');
    if (!notif.isDesignatedAdmin(caller)) throw new fn.HttpError(403, 'Réservé aux admins désignés.');
    const updated = fn.tx((txApp) => {
      let rec = null;
      try { rec = txApp.findRecordById('ThemeRequest', requestId); } catch (_) { rec = null; }
      if (!rec) return fn.fail(404, 'Demande introuvable.');
      if (rec.getString('status') !== 'pending') {
        return fn.fail(409, 'Cette demande est déjà traitée.', { status: rec.getString('status') });
      }
      rec.set('status', decision);
      rec.set('admin_note', note);
      rec.set('handled_by', caller.id);
      rec.set('handled_date', new DateTime());
      txApp.save(rec);
      return fn.ok(rec);
    });
    notif.themeRequestHandled(updated, decision, note);
    const p = fn.plain(updated);
    const request = {
      id: p.id, user_id: p.user_id, theme: p.theme, passage: p.passage || null, status: p.status,
      admin_note: p.admin_note || null, handled_by: p.handled_by, handled_date: fn.isoDate(p.handled_date),
      created_date: fn.createdDate(p),
    };
    return { ok: true, request };
  });
});

// ── Tâches planifiées ────────────────────────────────────────────────────────
// Reprise des push en échec temporaire (file PushEnvoi).
cronAdd('push_reessais', '* * * * *', () => {
  try {
    require(`${__hooks}/lib/push.js`).processQueue(500);
  } catch (_) {
    $app.logger().error('[push] reprise de la file impossible');
  }
});

// Verset du jour : 07:00 à Paris = 05:00 UTC (heure d'été) ou 06:00 UTC (heure d'hiver).
cronAdd('verset_du_jour', '0 5,6 * * *', () => {
  try {
    const r = require(`${__hooks}/lib/notifications.js`).dailyVerse(Date.now(), true);
    $app.logger().info('[verset_du_jour]', 'resultat', r.skipped || 'envoye', 'destinataires', r.recipients || 0);
  } catch (_) {
    $app.logger().error('[verset_du_jour] échec');
  }
});
