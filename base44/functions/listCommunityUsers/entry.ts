import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Retourne les champs publics nécessaires à l'annuaire des utilisateurs.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Connexion requise' }, { status: 401 });

    const records = await base44.asServiceRole.entities.User.list('-created_date', 100);
    if (!Array.isArray(records)) throw new Error('Réponse invalide lors du chargement des utilisateurs.');
    const users = records.map((user: any) => ({
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      profile_photo_url: user.profile_photo_url || '',
      role: user.role,
    }));

    return Response.json({ users });
  } catch (error) {
    console.error('[listCommunityUsers] Chargement des utilisateurs impossible.', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Erreur interne',
    }, { status: 500 });
  }
}
