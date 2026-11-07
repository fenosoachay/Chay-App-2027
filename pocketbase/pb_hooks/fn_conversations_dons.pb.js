// Bloc 2, lot 3 : conversations (création et participants via routes, règles corrigées),
// listThemeRequests et createDonationRequest (base44/functions/<nom>/entry.ts).
// Appelant identifié uniquement par e.auth.

// ── createConversation ───────────────────────────────────────────────────────
// Remplace Conversation.create (createRule = null). L'appelant doit être participant ;
// participants existants ; conversation directe = 2 personnes, sans doublon (l'existante
// est renvoyée, comme le faisait l'app avant de créer) ; groupe : admin_id = créateur.
// Réponse : l'enregistrement de la conversation (forme d'un Conversation.create Base44).
routerAdd('POST', '/api/fn/createConversation', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const conv = require(`${__hooks}/lib/conversations.js`);
  return fn.run(e, 'createConversation', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    const type = body.type;
    if (type !== 'direct' && type !== 'group') throw new fn.HttpError(400, 'Type de conversation invalide');
    const ids = conv.validateParticipants(fn, body.participant_ids, type);
    if (ids.indexOf(caller.id) === -1) throw new fn.HttpError(403, 'Forbidden');
    const name = fn.optionalString(body, 'name', 100, 'Nom invalide').trim();
    const photoUrl = fn.optionalString(body, 'photo_url', 2000, 'Photo invalide');
    if (type === 'group' && !name) throw new fn.HttpError(400, 'Nom du groupe requis');

    return fn.tx((txApp) => {
      const missing = conv.missingUsers(txApp, ids);
      if (missing) return fn.fail(400, 'Participant introuvable');
      if (type === 'direct') {
        const existing = conv.findDirect(txApp, ids[0], ids[1]);
        if (existing) return fn.ok(fn.plain(existing));
      }
      const values = { type, participant_ids: ids, created_by_id: caller.id };
      if (type === 'group') {
        values.name = name;
        values.photo_url = photoUrl;
        values.admin_id = caller.id;
      }
      const rec = fn.newRecord(txApp, 'Conversation', values);
      txApp.save(rec);
      return fn.ok(fn.plain(rec));
    });
  });
});

// ── updateConversationParticipants ───────────────────────────────────────────
// Remplace la modification directe de participant_ids (interdite par la règle).
// Groupes seulement ; réservé à l'admin du groupe (comme GroupSettingsSheet.jsx) ou à un
// admin de l'app ; nouveaux membres existants ; l'admin du groupe reste membre.
routerAdd('POST', '/api/fn/updateConversationParticipants', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const conv = require(`${__hooks}/lib/conversations.js`);
  return fn.run(e, 'updateConversationParticipants', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Unauthorized');
    const body = fn.readBody(e);
    const conversationId = typeof body.conversation_id === 'string' && body.conversation_id.length <= 64 ? body.conversation_id : '';
    if (!conversationId) throw new fn.HttpError(400, 'conversation_id requis');
    const ids = conv.validateParticipants(fn, body.participant_ids, 'group');

    return fn.tx((txApp) => {
      let rec = null;
      try { rec = txApp.findRecordById('Conversation', conversationId); } catch (_) { rec = null; }
      if (!rec) return fn.fail(404, 'conversation not found');
      const current = fn.plain(rec).participant_ids || [];
      const isAppAdmin = caller.getString('role') === 'admin';
      if (current.indexOf(caller.id) === -1 && !isAppAdmin) return fn.fail(404, 'conversation not found');
      if (rec.getString('type') !== 'group') return fn.fail(400, 'Les participants d’une conversation directe ne sont pas modifiables');
      const groupAdmin = rec.getString('admin_id');
      if (caller.id !== groupAdmin && !isAppAdmin) return fn.fail(403, 'Réservé à l’admin du groupe');
      if (groupAdmin && ids.indexOf(groupAdmin) === -1) return fn.fail(400, 'L’admin du groupe doit rester membre');
      const added = ids.filter((id) => current.indexOf(id) === -1);
      if (conv.missingUsers(txApp, added)) return fn.fail(400, 'Participant introuvable');
      rec.set('participant_ids', ids);
      txApp.save(rec);
      return fn.ok(fn.plain(rec));
    });
  });
});

// ── listThemeRequests ────────────────────────────────────────────────────────
// Admin « désigné » : role admin, sauf le tout premier compte (même règle que Base44).
routerAdd('POST', '/api/fn/listThemeRequests', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'listThemeRequests', 'Erreur interne.', () => {
    const STATUSES = ['pending', 'validated', 'declined'];
    const caller = fn.requireUser(e, 'Connexion requise.');
    if (caller.getString('role') !== 'admin') throw new fn.HttpError(403, 'Réservé aux admins désignés.');
    const body = fn.readBody(e);
    const status = body.status === undefined || body.status === null ? null : body.status;
    if (status !== null && STATUSES.indexOf(status) === -1) throw new fn.HttpError(400, 'Statut invalide.');
    let limit = 200;
    if (body.limit !== undefined && body.limit !== null) {
      if (!Number.isInteger(body.limit) || body.limit < 1) throw new fn.HttpError(400, 'Limite invalide.');
      limit = Math.min(body.limit, 200);
    }
    const first = fn.findOne($app, 'users', "id != ''", 'base44_created_date,created', {});
    if (!first || first.id === caller.id) throw new fn.HttpError(403, 'Réservé aux admins désignés.');

    const rows = status
      ? $app.findRecordsByFilter('ThemeRequest', 'status = {:s}', '-base44_created_date,-created', limit, 0, { s: status })
      : $app.findRecordsByFilter('ThemeRequest', "id != ''", '-base44_created_date,-created', limit, 0);
    const items = rows.map((r) => {
      const p = fn.plain(r);
      // Base44 omettait les champs absents : on ne renvoie pas les champs vides.
      const out = { id: p.id, theme: p.theme, status: p.status, created_date: fn.createdDate(p) };
      if (p.passage) out.passage = p.passage;
      if (p.admin_note) out.admin_note = p.admin_note;
      if (p.handled_date) out.handled_date = fn.isoDate(p.handled_date);
      return out;
    });
    return { items };
  });
});

// ── createDonationRequest ────────────────────────────────────────────────────
// Une seule demande en attente par utilisateur (vérification + création en transaction).
routerAdd('POST', '/api/fn/createDonationRequest', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'createDonationRequest', 'Erreur interne', () => {
    const caller = fn.requireUser(e, 'Unauthorized');
    const username = caller.getString('name')
      || [caller.getString('first_name'), caller.getString('last_name')].filter(Boolean).join(' ')
      || caller.getString('email')
      || 'Membre';
    return fn.tx((txApp) => {
      if (fn.findOne(txApp, 'DonationRequest', "userId = {:u} && status = 'pending'", '', { u: caller.id })) {
        return fn.ok({ already_pending: true });
      }
      const rec = fn.newRecord(txApp, 'DonationRequest', {
        userId: caller.id,
        username,
        message: 'veut faire un don, contactez-le',
        status: 'pending',
        is_read: false,
      });
      txApp.save(rec);
      return fn.ok({ id: rec.id, already_pending: false });
    });
  });
});
