import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Mur de prière — anonymat garanti côté serveur.
// Seules les prières ouvertes sont retournées, et uniquement les champs publics.
// requester_id et taken_by ne quittent JAMAIS le backend.
const PUBLIC_FIELDS = ['id', 'category', 'content', 'created_date', 'status'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: 'Connexion requise.' }, { status: 401 });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.PrayerRequest.filter({ status: 'open' }, '-created_date', 200);
    const list = Array.isArray(rows) ? rows : [];

    const wall = list.map((p) => {
      const out = {};
      for (const key of PUBLIC_FIELDS) {
        if (key === 'requester_id' || key === 'taken_by') continue; // jamais exposé
        if (p[key] !== undefined && p[key] !== null) out[key] = p[key];
      }
      return out;
    });

    return Response.json({ items: wall, count: wall.length });
  } catch (error) {
    console.error('[getPrayerWall] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
