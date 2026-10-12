import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Enregistre l'intention de don d'un utilisateur authentifié (une seule demande en attente à la fois).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let caller = null;
    try { caller = await base44.auth.me(); } catch { /* non connecté */ }
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await base44.asServiceRole.entities.DonationRequest.filter(
      { userId: caller.id, status: "pending" },
      { limit: 1 }
    );
    if (existing.items.length > 0) {
      return Response.json({ already_pending: true });
    }

    const username = caller.full_name
      || [caller.first_name, caller.last_name].filter(Boolean).join(" ")
      || caller.email
      || "Membre";

    const created = await base44.asServiceRole.entities.DonationRequest.create({
      userId: caller.id,
      username,
      message: "veut faire un don, contactez-le",
      status: "pending",
      is_read: false,
    });

    return Response.json({ id: created.id, already_pending: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}