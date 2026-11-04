import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Inventaire en lecture seule : compteurs uniquement, aucune donnée personnelle.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    let caller: { role?: unknown } | null = null;
    try {
      caller = await base44.auth.me();
    } catch {
      caller = null;
    }
    if (!caller) return json({ error: 'unauthenticated' }, 401);
    if (caller.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const users = base44.asServiceRole.entities.User;

    const c = {
      total: 0,
      is_membre_true: 0,
      is_membre_false: 0,
      is_membre_absent_ou_nul: 0,
      is_membre_type_inattendu: 0,
      role_admin: 0,
      role_user: 0,
      role_moderator: 0,
      role_inattendu_ou_absent: 0,
      identifiants_en_double: 0,
      pages_lues: 0,
    };
    const seen = new Set<string>();
    let cursor: string | null = null;

    for (;;) {
      const opts: Record<string, unknown> = {
        sort: 'created_date',
        limit: PAGE_SIZE,
        fields: ['id', 'role', 'is_membre'],
      };
      if (cursor) opts.cursor = cursor;

      const page: any = await users.list(opts);
      if (!page || !Array.isArray(page.items)) {
        return json({ error: 'unexpected_page_format' }, 502);
      }
      c.pages_lues++;

      for (const u of page.items) {
        c.total++;
        if (typeof u?.id === 'string') {
          if (seen.has(u.id)) c.identifiants_en_double++;
          else seen.add(u.id);
        }

        if (u?.is_membre === true) c.is_membre_true++;
        else if (u?.is_membre === false) c.is_membre_false++;
        else if (u?.is_membre === undefined || u?.is_membre === null) c.is_membre_absent_ou_nul++;
        else c.is_membre_type_inattendu++;

        if (u?.role === 'admin') c.role_admin++;
        else if (u?.role === 'user') c.role_user++;
        else if (u?.role === 'moderator') c.role_moderator++;
        else c.role_inattendu_ou_absent++;
      }

      if (!page.has_more) break;
      if (!page.next_cursor || c.pages_lues >= MAX_PAGES) {
        return json({ error: 'pagination_incomplete', partial: c }, 502);
      }
      cursor = page.next_cursor;
    }

    // Recoupement indépendant ; en cas d'échec, seul un indicateur booléen est renvoyé.
    const crossCheck: Record<string, unknown> = {};
    try {
      crossCheck.count_total = await users.count();
    } catch {
      crossCheck.count_disponible = false;
    }
    try {
      const agg: any = await users.aggregate({ groupBy: 'role' });
      const rows = Array.isArray(agg?.rows) ? agg.rows : [];
      let admin = 0, user = 0, moderator = 0, autre = 0;
      for (const r of rows) {
        const n = Number(r?.count) || 0;
        if (r?.role === 'admin') admin += n;
        else if (r?.role === 'user') user += n;
        else if (r?.role === 'moderator') moderator += n;
        else autre += n;
      }
      crossCheck.aggregate_roles = { admin, user, moderator, autre };
      crossCheck.aggregate_truncated = Boolean(agg?.truncated);
    } catch {
      crossCheck.aggregate_disponible = false;
    }

    return json({ ...c, crossCheck });
  } catch {
    console.error('[inventoryUsers] failure');
    return json({ error: 'internal_error' }, 500);
  }
}
