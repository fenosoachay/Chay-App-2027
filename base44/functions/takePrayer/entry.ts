import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ─── Helpers locaux ─────────────────────────────────────────────────────────

async function notifyInApp(svc, rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.user_id) : [];
  if (!list.length) return 0;
  let created = 0;
  for (let i = 0; i < list.length; i += 200) {
    try {
      const res = await svc.entities.UserNotification.bulkCreate(list.slice(i, i + 200));
      created += Array.isArray(res) ? res.length : list.slice(i, i + 200).length;
    } catch (error) {
      console.error('[takePrayer] Notification in-app impossible.', error?.message || String(error));
    }
  }
  return created;
}

// ─── Fonction principale ────────────────────────────────────────────────────

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

    // Push best-effort
    try {
      await svc.functions.invoke('sendFcmPush', {
        user_ids: [prayer.requester_id],
        title,
        body: message,
        target_type: 'prayer',
        target_id: prayerId,
      });
    } catch (e) {
      console.log('[takePrayer] Push non disponible, ignoré.');
    }

    return Response.json({ ok: true, id: prayerId, status: 'taken' });
  } catch (error) {
    console.error('[takePrayer] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
