import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const STATUSES = ['pending', 'validated', 'declined'];
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 200;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Même règle que handleThemeRequest : admin, hors premier compte selon User.list('created_date', 1).
async function isDesignatedAdmin(svc: any, userId: unknown): Promise<boolean> {
  if (!userId) return false;
  const me = await svc.entities.User.get(userId).catch(() => null);
  if (!me || me.role !== 'admin') return false;
  const first = await svc.entities.User.list('created_date', 1).catch(() => []);
  const firstAdminId = Array.isArray(first) && first[0] ? String(first[0].id) : null;
  return Boolean(firstAdminId) && firstAdminId !== String(userId);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    let caller: any = null;
    try {
      caller = await base44.auth.me();
    } catch {
      caller = null;
    }
    if (!caller) return json({ error: 'Connexion requise.' }, 401);
    if (caller.role !== 'admin') return json({ error: 'Réservé aux admins désignés.' }, 403);

    const body: any = await req.json().catch(() => ({}));

    const status = body?.status ?? null;
    if (status !== null && !STATUSES.includes(status)) {
      return json({ error: 'Statut invalide.' }, 400);
    }

    let limit = DEFAULT_LIMIT;
    if (body?.limit !== undefined && body?.limit !== null) {
      if (!Number.isInteger(body.limit) || body.limit < 1) {
        return json({ error: 'Limite invalide.' }, 400);
      }
      limit = Math.min(body.limit, MAX_LIMIT);
    }

    const svc = base44.asServiceRole;
    if (!(await isDesignatedAdmin(svc, caller.id))) {
      return json({ error: 'Réservé aux admins désignés.' }, 403);
    }

    const rows = await svc.entities.ThemeRequest.filter(
      status ? { status } : {},
      '-created_date',
      limit,
    );

    const items = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      theme: r.theme,
      passage: r.passage,
      status: r.status,
      admin_note: r.admin_note,
      created_date: r.created_date,
      handled_date: r.handled_date,
    }));

    return json({ items });
  } catch {
    console.error('[listThemeRequests] failure');
    return json({ error: 'Erreur interne.' }, 500);
  }
}
