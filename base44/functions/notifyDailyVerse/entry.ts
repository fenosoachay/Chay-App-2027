import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Notification quotidienne du verset, déclenchée par le workflow planifié
// « Verset du jour » (tous les jours à 07:00, Europe/Paris — une exécution
// par jour, ce qui coûte 1 crédit).
//
// Cibles : utilisateurs dont
//   - notifications_enabled !== false et notif_verse !== false,
//   - le jour (dans leur fuseau) est coché dans notif_verse_days,
//   - notif_verse_time <= "07:00" (les heures supérieures seront prises en
//     charge si d'autres workflows planifiés sont ajoutés plus tard).
//
// Idempotent par jour : notification_id "verse_<date>" ; si la fonction est
// relancée, seuls les utilisateurs pas encore notifiés sont traités.
//
// Le verset est lu dans Devotional par reading_date = date du jour (la
// clé de publication du planning côté admin).
const APP_TZ = "Europe/Paris";
const WEEKDAYS = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
const DEFAULT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Date + jour de semaine (short : "Mon".."Sun") dans un fuseau donné.
function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : "";
  };
  return { dateStr: get("year") + "-" + get("month") + "-" + get("day"), weekday: get("weekday") };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Auth : admin OU appel interne (workflow planifié) prouvé par secret.
    // Auth : admin, OU appel interne prouvé par secret, OU jeton de service
    // de la plateforme (workflow planifié) — validé réellement par un appel,
    // pas seulement par la présence de l'en-tête (qu'un client peut forger).
    const body = await req.json().catch(() => ({}));
    const expected = secrets.get("INTERNAL_INVOKE_SECRET");
    let allowed = !!expected && body.internal_secret === expected;
    if (!allowed) {
      try { allowed = (await base44.auth.me())?.role === "admin"; } catch {}
    }
    if (!allowed && req.headers.get("Base44-Service-Authorization")) {
      // Sonde d'écriture : UserNotification n'autorise la création qu'aux
      // admins/service ; un jeton forgé est rejeté par la plateforme.
      try {
        const probe = await base44.asServiceRole.entities.UserNotification.create({
          user_id: "__auth_probe__",
          notification_id: "__auth_probe__",
          title: "probe",
        });
        if (probe?.id) {
          await base44.asServiceRole.entities.UserNotification.delete(probe.id).catch(() => {});
        }
        allowed = true;
      } catch {}
    }
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const appParts = localParts(now, APP_TZ);
    const dateStr = appParts.dateStr;
    // Anti-abus : rien avant ~07:00 à Paris (l'alarme du workflow sonne à 07:00).
const hhmm = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" }).format(now);
if (hhmm < "06:55") {
return Response.json({ skipped: "too_early", date: dateStr });
}

    const notifId = "verse_" + dateStr;

    // Verset publié pour aujourd'hui (aucun → rien à envoyer).
    const devs = await base44.asServiceRole.entities.Devotional
      .filter({ reading_date: dateStr }, null, 1).catch(() => []);
    const dev = (Array.isArray(devs) ? devs : [])[0];
    if (!dev) {
      return Response.json({ skipped: "no_devotional", date: dateStr });
    }

    // Utilisateurs déjà notifiés aujourd'hui (déduplication).
    const already = await base44.asServiceRole.entities.UserNotification
      .filter({ notification_id: notifId }, null, 5000).catch(() => []);
    const done = new Set(
      (Array.isArray(already) ? already : []).map((n) => n.user_id)
    );

    const reference = dev.scripture_reference || dev.title || "Verset du jour";
    const title = "Verset du jour";
    const message = (reference + (dev.verse_text ? " — " + dev.verse_text : "")).slice(0, 300);

    const tzCache = new Map(); // fuseau → parties locales mémoïsées
    const targets = []; // utilisateurs éligibles à la notification in-app
    const pushTargets = []; // utilisateurs ayant activé le canal push
    let skip = 0;
    while (skip < 5000) {
      const batch = await base44.asServiceRole.entities.User
        .list("-created_date", 500, skip);
      const arr = Array.isArray(batch) ? batch : [];
      for (const u of arr) {
        if (done.has(u.id)) continue;
        const s = u.settings || {};
        if (s.notifications_enabled === false) continue;
        if (s.notif_verse === false) continue;

        // Jour de semaine dans le fuseau de l'utilisateur (défaut Paris) ;
        // un formatteur Intl par fuseau (mémoïsé), pas un par utilisateur.
        const tz = typeof s.tz === "string" && s.tz ? s.tz : APP_TZ;
        let parts = tzCache.get(tz);
 if (!parts) {
try {
parts = localParts(now, tz);
} catch {
parts = localParts(now, APP_TZ);
}
tzCache.set(tz, parts);
}

        const day = WEEKDAYS[parts.weekday] || appParts.weekday;
        const days = Array.isArray(s.notif_verse_days) && s.notif_verse_days.length
          ? s.notif_verse_days
          : DEFAULT_DAYS;
        if (!days.includes(day)) continue;

        const time = typeof s.notif_verse_time === "string" && s.notif_verse_time
          ? s.notif_verse_time
          : "07:00";
        if (time > "07:00") continue; // heures non planifiées pour l'instant

        targets.push(u.id);
        if (s.notif_push !== false) pushTargets.push(u.id);
      }
      if (arr.length < 500) break;
      skip += 500;
    }

    // Notification in-app (par lots de 500).
    let created = 0;
    for (let i = 0; i < targets.length; i += 500) {
      const rows = targets.slice(i, i + 500).map((uid) => ({
        user_id: uid,
        notification_id: notifId,
        type: "daily_verse",
        content_id: dev.id,
        content_type: "devotional",
        title,
        message,
        thumbnail_url: dev.image_url || "",
        is_read: false,
      }));
      try {
        const res = await base44.asServiceRole.entities.UserNotification.bulkCreate(rows);
        created += Array.isArray(res) ? res.length : 0;
      } catch (error) {
        console.error("[notifyDailyVerse] Création des notifications impossible.", {
          offset: i,
          error: error?.message || String(error),
        });
      }
    }

    // Push (sendFcmPush enchaîne sendWebPush → Android + navigateur).
    let pushSent = 0, pushFailed = 0, webPushSent = 0;
    if (pushTargets.length) {
      try {
        const res = await base44.asServiceRole.functions.invoke("sendFcmPush", {
          user_ids: pushTargets,
          title,
          body: message,
          target_type: "daily_verse",
          target_id: dev.id,
          internal_secret: secrets.get("INTERNAL_INVOKE_SECRET"),
        });
        const r = (res && (res.data || res)) || {};
        pushSent = (r.sent || 0) + (r.webPush?.sent || 0);
        pushFailed = (r.failed || 0) + (r.webPush?.failed || 0);
        webPushSent = (r.webPush && r.webPush.sent) || 0;
        if (r.webPush?.skipped && !(r.sent > 0)) {
          pushFailed = Math.max(pushFailed, pushTargets.length);
          console.error("[notifyDailyVerse] Push non disponible.", r.webPush.skipped);
        }
        if (r.fcmError && !(r.webPush?.sent > 0)) {
          pushFailed = Math.max(pushFailed, pushTargets.length);
          console.error("[notifyDailyVerse] Configuration FCM invalide.", r.fcmError);
        }
      } catch (e) {
        pushFailed = pushTargets.length;
        console.error("[notifyDailyVerse] Envoi push impossible.", e?.message || String(e));
      }
    }

    return Response.json({
      date: dateStr,
      devotional: dev.id,
      recipients: targets.length,
      created,
      pushSent,
      pushFailed,
      webPushSent,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}