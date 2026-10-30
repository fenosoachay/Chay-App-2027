// Helpers partagés par les fonctions « Requêtes » (thèmes à expliquer + prières).
import { secrets } from 'base44:runtime';

export function internalProof(body) {
  const expected = secrets.get('INTERNAL_INVOKE_SECRET');
  return Boolean(expected && body && body.internal_secret === expected);
}

// Un compte est « destinataire des demandes de thème » s'il porte le rôle admin
// sans être le premier admin créé (le créateur de l'application).
export async function isDesignatedAdmin(svc, userId) {
  if (!userId) return false;
  const me = await svc.entities.User.get(userId).catch(() => null);
  if (!me || me.role !== 'admin') return false;
  const first = await svc.entities.User.list('created_date', 1).catch(() => []);
  const firstAdminId = Array.isArray(first) && first[0] ? String(first[0].id) : null;
  return Boolean(firstAdminId) && firstAdminId !== String(userId);
}

// Retourne la liste des admins désignés (destinataires des thèmes).
export async function listDesignatedAdmins(svc) {
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

// Notification in-app (cloche + bandeau temps réel).
export async function notifyInApp(svc, rows) {
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

// Push (FCM + navigateur) best-effort.
export async function pushNotify(svc, userIds, { title, body, targetType, targetId }) {
  const ids = Array.isArray(userIds) ? userIds.filter(Boolean) : [];
  if (!ids.length) return null;
  try {
    return await svc.functions.invoke('sendFcmPush', {
      user_ids: ids,
      title,
      body,
      target_type: targetType,
      target_id: targetId,
      internal_secret: secrets.get('INTERNAL_INVOKE_SECRET'),
    });
  } catch (error) {
    console.error('[requests] Push impossible.', error?.message || String(error));
    return null;
  }
}

// E-mail simple, best-effort.
export async function emailNotify(svc, to, subject, text) {
  if (!to) return false;
  try {
    await svc.integrations.Core.SendEmail({ to, subject, body: text });
    return true;
  } catch (error) {
    console.error('[requests] E-mail impossible.', error?.message || String(error));
    return false;
  }
}
