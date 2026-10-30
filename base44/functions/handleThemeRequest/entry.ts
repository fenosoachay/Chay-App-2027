import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { isDesignatedAdmin, notifyInApp, pushNotify, emailNotify } from '../shared/requests.ts';

// Traitement d'une demande de thème par un admin désigné : « validated » ou
// « declined », avec note facultative. Le créateur de l'application (premier
// admin) ne peut pas traiter une demande — même règle que pour la lecture.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: 'Connexion requise.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body.request_id === 'string' ? body.request_id : '';
    const decision = body.decision;
    const note = typeof body.admin_note === 'string' ? body.admin_note.trim().slice(0, 500) : '';

    if (!requestId) return Response.json({ error: 'Demande introuvable.' }, { status: 400 });
    if (!['validated', 'declined'].includes(decision)) {
      return Response.json({ error: 'Décision invalide.' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    if (!(await isDesignatedAdmin(svc, caller.id))) {
      return Response.json({ error: 'Réservé aux admins désignés.' }, { status: 403 });
    }

    const request = await svc.entities.ThemeRequest.get(requestId).catch(() => null);
    if (!request) return Response.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (request.status !== 'pending') {
      return Response.json({ error: 'Cette demande est déjà traitée.', status: request.status }, { status: 409 });
    }

    const updated = await svc.entities.ThemeRequest.update(requestId, {
      status: decision,
      admin_note: note || null,
      handled_by: caller.id,
      handled_date: new Date().toISOString(),
    });

    const title = decision === 'validated' ? 'Ta demande de thème est retenue' : 'Réponse à ta demande de thème';
    const message = decision === 'validated'
      ? `Le Pasteur prend en compte : « ${String(request.theme || '').slice(0, 120)} ».`
      : `« ${String(request.theme || '').slice(0, 120)} » n'est pas retenu${note ? ` — ${note.slice(0, 120)}` : ''}.`;

    await notifyInApp(svc, [{
      user_id: request.user_id,
      notification_id: `theme_answer_${requestId}`,
      type: 'theme_answer',
      content_type: 'theme_answer',
      content_id: requestId,
      title,
      message,
      is_read: false,
    }]);

    const requester = await svc.entities.User.get(request.user_id).catch(() => null);
    if (requester?.email) {
      await emailNotify(svc, requester.email, title, `${message}\n\nVoir tes requêtes : https://chay.base44.app/requests`);
    }
    await pushNotify(svc, [request.user_id], { title, body: message, targetType: 'theme_answer', targetId: requestId });

    return Response.json({ ok: true, request: updated });
  } catch (error) {
    console.error('[handleThemeRequest] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
