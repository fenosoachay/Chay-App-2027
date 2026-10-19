import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import webpush from 'npm:web-push';

// Envoi de notifications push navigateur (Web Push, standard VAPID).
// - Abonnements actifs lus dans WebPushSubscription (créés depuis
//   Réglages → Notifications, bouton « Activer »).
// - Clé privée : secret VAPID_PRIVATE_KEY ; clé publique codée en dur
//   (publique par conception — même valeur que src/lib/webPush.js).
// - Appelée par sendFcmPush : mêmes destinataires que le push natif, donc
//   tous les envois existants (messages, nouveautés, verset) en profitent.
// - Auth : admin direct OU appel interne prouvé par internal_secret.
// - Un abonnement expiré (404/410) est désactivé automatiquement.
const VAPID_SUBJECT = "https://chay.base44.app";
const VAPID_PUBLIC_KEY = "BCWq_4_Qu_DqSH3SR-s0xyCt8gE29xZ4LilwMf3Hp5DyekihEmRVGkt7fwsCoago_sXoD23roB20zW5sZNnC_LE";

function summarizeByUser(userIds, userResults) {
  return userIds.map((userId, index) => {
    const { attempted, succeeded, failed, deactivated } = userResults.get(userId);
    return { recipientIndex: index + 1, attempted, succeeded, failed, deactivated };
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* appel interne */ }
    const body = await req.json().catch(() => ({}));
    const isInternal = body.internal_secret && body.internal_secret === secrets.get("INTERNAL_INVOKE_SECRET");
    if (!(caller && caller.role === "admin") && !isInternal) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userIds: string[] = Array.isArray(body.user_ids)
      ? body.user_ids.filter(Boolean)
      : [];
    const title = String(body.title || "ÉGLISE CHAY").slice(0, 100);
    const message = String(body.body || "").slice(0, 300);
    const targetType = String(body.target_type || "");
    const targetId = String(body.target_id || "");
    if (userIds.length === 0) {
      return Response.json({ sent: 0, failed: 0, subscriptions: 0, byUser: [] });
    }
    const byUser = [];
    const userResults = new Map();
    for (const userId of userIds) {
      if (!userResults.has(userId)) {
        const result = {
          user_id: userId,
          attempted: 0,
          succeeded: 0,
          failed: 0,
          deactivated: 0,
        };
        userResults.set(userId, result);
        byUser.push(result);
      }
    }

    const privateKey = secrets.get("VAPID_PRIVATE_KEY");
    if (!privateKey) {
      return Response.json({
        sent: 0,
        failed: 0,
        subscriptions: 0,
        skipped: "no_vapid_key",
        byUser: summarizeByUser(userIds, userResults),
      });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);

    // Abonnements actifs des destinataires (pagination, list() vérifié).
    const wanted = new Set(userIds);
    const subs = [];
    let skip = 0;
    while (skip < 5000) {
      const batch = await base44.asServiceRole.entities.WebPushSubscription
        .list("-last_seen", 500, skip);
      const arr = Array.isArray(batch) ? batch : [];
      for (const s of arr) {
        // Sécurité : `user_id` est client-writable. On n'envoie qu'aux
        // abonnements dont created_by_id (fixé côté serveur) correspond au
        // user_id revendiqué. Empêche un attaquant d'enregistrer son propre
        // navigateur sous l'id d'un autre membre pour intercepter ses push.
        if (s.is_active !== false && wanted.has(s.user_id) && s.created_by_id === s.user_id) subs.push(s);
      }
      if (arr.length < 500) break;
      skip += 500;
    }
    if (subs.length === 0) {
      return Response.json({
        sent: 0,
        failed: 0,
        subscriptions: 0,
        byUser: summarizeByUser(userIds, userResults),
      });
    }

    const payload = JSON.stringify({
      title,
      body: message,
      target_type: targetType,
      target_id: targetId,
    });
    const ttl = typeof body.ttl === "number" ? body.ttl : 21600; // 6 h

    let sent = 0, failed = 0, deactivated = 0;
    const CHUNK = 10;
    for (let i = 0; i < subs.length; i += CHUNK) {
      const chunk = subs.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async (s) => {
        const userResult = userResults.get(s.user_id);
        if (userResult) userResult.attempted += 1;
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: ttl }
          );
          sent += 1;
          if (userResult) userResult.succeeded += 1;
        } catch (e) {
          failed += 1;
          if (userResult) userResult.failed += 1;
          const code = e && e.statusCode;
          if (code === 404 || code === 410) {
            // Abonnement expiré ou révoqué : on le désactive.
            try {
              await base44.asServiceRole.entities.WebPushSubscription
                .update(s.id, { is_active: false });
              deactivated += 1;
              if (userResult) userResult.deactivated += 1;
            } catch {
              // Keep delivery failure separate from deactivation failure.
            }
          }
        }
      }));
    }

    return Response.json({
      sent,
      failed,
      subscriptions: subs.length,
      deactivated,
      byUser: summarizeByUser(userIds, userResults),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}