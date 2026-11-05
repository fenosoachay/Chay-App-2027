import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ─── Helpers copiés localement (plus besoin de shared/requests.ts) ──────────

async function listDesignatedAdmins(svc) {
  const ids = [];
  let skip = 0;
  while (skip < 5000) {
    const batch = await svc.entities.User.list('-created_date', 500, skip).catch(() => []);
    const arr = Array.isArray(batch) ? batch : [];
    for (const u of arr) {
      if (u?.role === 'admin' && u.id) ids.push(u.id);
    }
    if (arr.length < 500) break;
    skip += 500;
  }
  const first = await svc.entities.User.list('created_date', 1).catch(() => []);
  const firstAdminId = Array.isArray(first) && first[0] ? String(first[0].id) : null;
  return [...new Set(ids)].filter((id) => String(id) !== firstAdminId);
}

async function notifyInApp(svc, rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.user_id) : [];
  if (!list.length) return 0;
  let created = 0;
  for (let i = 0; i < list.length; i += 200) {
    try {
      const res = await svc.entities.UserNotification.bulkCreate(list.slice(i, i + 200));
      created += Array.isArray(res) ? res.length : list.slice(i, i + 200).length;
    } catch (error) {
      console.error('[requests] Notification in-app impossible.', error?.message || String(error));
    }
  }
  return created;
}

async function emailNotify(svc, to, subject, text) {
  if (!to) return false;
  try {
    await svc.integrations.Core.SendEmail({ to, subject, body: text });
    return true;
  } catch (error) {
    console.error('[requests] E-mail impossible.', error?.message || String(error));
    return false;
  }
}

// ─── Fonction principale ────────────────────────────────────────────────────

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: 'Connexion requise.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const theme = typeof body.theme === 'string' ? body.theme.trim() : '';
    const passage = typeof body.passage === 'string' ? body.passage.trim().slice(0, 200) : '';

    if (!theme) return Response.json({ error: 'Le thème est obligatoire.' }, { status: 400 });
    if (theme.length > 500) return Response.json({ error: 'Le thème dépasse 500 caractères.' }, { status: 400 });

    const svc = base44.asServiceRole;
    const request = await svc.entities.ThemeRequest.create({
      user_id: caller.id,
      theme,
      passage: passage || null,
      status: 'pending',
    });

    const adminIds = await listDesignatedAdmins(svc);
    const title = 'Nouvelle demande de thème';
    const message = theme.slice(0, 140);

    const rows = adminIds.map((id) => ({
      user_id: id,
      notification_id: `theme_request_${request.id}`,
      type: 'theme_request',
      content_type: 'theme_request',
      content_id: request.id,
      title,
      message,
      is_read: false,
    }));

    const notified = await notifyInApp(svc, rows);

    // E-mail aux mêmes destinataires (best-effort).
    const admins = await Promise.all(adminIds.map((id) => svc.entities.User.get(id).catch(() => null)));
    await Promise.all(
      admins.filter((a) => a?.email).map((a) =>
        emailNotify(svc, a.email, title, `${message}\n\nVoir la demande : https://chay.base44.app/requests`)
      )
    );

    // Push notifications — on ignore si ça échoue (best-effort)
    try {
      await svc.functions.invoke('sendFcmPush', {
        user_ids: adminIds,
        title,
        body: message,
        target_type: 'theme_request',
        target_id: request.id,
      });
    } catch (e) {
      console.log('[createThemeRequest] Push non disponible, ignoré.');
    }

    return Response.json({ id: request.id, recipients: notified });
  } catch (error) {
    console.error('[createThemeRequest] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
