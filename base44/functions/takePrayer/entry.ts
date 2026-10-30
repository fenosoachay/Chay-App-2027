import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { notifyInApp, pushNotify } from '../shared/requests.ts';

// Prise en charge d'une prière : opération atomique.
// - Relecture avant écriture pour éviter les conflits (deux clics en même temps).
// - Impossible de prendre sa propre demande.
// - Le demandeur est notifié SANS révéler l'identité de l'intercesseur.
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

    if (String(prayer.requester_id) === String(caller.id)) {
      return Response.json({ error: 'Tu ne peux pas prendre en charge ta propre demande.' }, { status: 403 });
    }

    if (prayer.status !== 'open') {
      return Response.json({ error: 'Cette prière a déjà été prise en charge.' }, { status: 409 });
    }

    // Relecture à l'instant de l'écriture : limite la fenêtre de concurrence.
    const fresh = await svc.entities.PrayerRequest.get(prayerId).catch(() => null);
    if (!fresh || fresh.status !== 'open') {
      return Response.json({ error: 'Cette prière vient d\'être prise en charge par quelqu\'un d\'autre.' }, { status: 409 });
    }

    await svc.entities.PrayerRequest.update(prayerId, {
      status: 'taken',
      taken_by: caller.id,
      taken_date: new Date().toISOString(),
    });

    const title = 'Quelqu\'un prie pour toi';
    const message = 'Une personne a pris ta demande de prière en charge. Son identité reste anonyme.';

    await notifyInApp(svc, [{
      user_id: prayer.requester_id,
      notification_id: `prayer_taken_${prayerId}`,
      type: 'prayer_taken',
      content_type: 'prayer',
      content_id: prayerId,
      title,
      message,
      is_read: false,
    }]);

    await pushNotify(svc, [prayer.requester_id], { title, body: message, targetType: 'prayer', targetId: prayerId });

    return Response.json({ ok: true, id: prayerId, status: 'taken' });
  } catch (error) {
    console.error('[takePrayer] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
