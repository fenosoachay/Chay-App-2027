import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Création d'une demande de prière anonyme.
// - Limite : 3 demandes maximum par utilisateur et par jour calendaire.
// - L'auteur est forcé côté serveur.
// - Statut initial : "open" (visible sur le mur public).
const MAX_PER_DAY = 3;
const CATEGORIES = ['Santé', 'Famille', 'Travail', 'Guidance', 'Autre'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: 'Connexion requise.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === 'string' ? body.category : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!CATEGORIES.includes(category)) {
      return Response.json({ error: 'Catégorie invalide.' }, { status: 400 });
    }
    if (!content) return Response.json({ error: 'Le sujet de prière est obligatoire.' }, { status: 400 });
    if (content.length > 300) return Response.json({ error: 'Le sujet dépasse 300 caractères.' }, { status: 400 });

    const svc = base44.asServiceRole;

    // Vérification de la limite quotidienne (3 demandes max par jour).
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const todayRequests = await svc.entities.PrayerRequest.filter(
      {
        requester_id: caller.id,
        created_date: { $gte: startOfDay, $lt: tomorrow },
      },
      '-created_date',
      10
    );

    const todayCount = Array.isArray(todayRequests) ? todayRequests.length : 0;
    if (todayCount >= MAX_PER_DAY) {
      return Response.json({
        error: `Tu as atteint la limite de ${MAX_PER_DAY} demandes de prière aujourd'hui.`,
        limit_reached: true,
      }, { status: 429 });
    }

    const created = await svc.entities.PrayerRequest.create({
      requester_id: caller.id,
      category,
      content,
      status: 'open',
    });

    return Response.json({ id: created.id, today_remaining: MAX_PER_DAY - todayCount - 1 });
  } catch (error) {
    console.error('[createPrayerRequest] Échec.', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
