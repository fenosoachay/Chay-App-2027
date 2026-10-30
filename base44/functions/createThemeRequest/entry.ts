import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { listDesignatedAdmins, notifyInApp, pushNotify, emailNotify } from '../shared/requests.ts';

// Création d'une demande de thème à expliquer.
// - L'auteur est forcé côté serveur (jamais pris du client).
// - Seuls les admins désignés (rôle admin, hors créateur de l'application)
//   reçoivent la notification ; le premier admin créé ne voit rien.
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

    await pushNotify(svc, adminIds, { title, body: message, targetType: 'theme_request', targetId: request.id });

    return Response.json({ id: request.id, recipients: notified });
  } catch (error) {
    console.error('[createThemeRequest] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
