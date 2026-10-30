import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { notifyInApp, pushNotify } from '../shared/requests.ts';

// Le demandeur marque sa prière comme « exaucée ».
// - Seul le demandeur original peut faire cette action.
// - La prière doit être en statut "taken" (prise en charge).
// - L'intercesseur est notifié de la bonne nouvelle.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: 'Connexion requise.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const prayerId = typeof body.prayer_id === 'string' ? body.prayer_id : '';
    if (!prayerId) return Response.json({ error: 'Prière introuvable.' }, { status: 400 });

    const svc = base44.asServiceRole;
    const prayer = await svc.entities.PrayerRequest.get(prayerId).catch(() => null);
    if (!prayer) return Response.json({ error: 'Prière introuvable.' }, { status: 404 });

    if (String(prayer.requester_id) !== String(caller.id)) {
      return Response.json({ error: 'Seul le demandeur peut marquer cette prière comme exaucée.' }, { status: 403 });
    }

    if (prayer.status !== 'taken') {
      return Response.json({ error: 'Cette prière doit d\'abord être prise en charge.' }, { status: 409 });
    }

    await svc.entities.PrayerRequest.update(prayerId, {
      status: 'answered',
      answered_date: new Date().toISOString(),
    });

    // Notifier l'intercesseur (si connu) — sa prière a porté fruit !
    if (prayer.taken_by) {
      const title = 'Une prière que tu as prise en charge est exaucée';
      const message = 'Le demandeur a marqué cette demande comme exaucée. Merci pour ta prière !';

      await notifyInApp(svc, [{
        user_id: prayer.taken_by,
        notification_id: `prayer_answered_${prayerId}`,
        type: 'prayer_answered',
        content_type: 'prayer',
        content_id: prayerId,
        title,
        message,
        is_read: false,
      }]);

      await pushNotify(svc, [prayer.taken_by], { title, body: message, targetType: 'prayer', targetId: prayerId });
    }

    return Response.json({ ok: true, id: prayerId, status: 'answered' });
  } catch (error) {
    console.error('[answerPrayer] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
