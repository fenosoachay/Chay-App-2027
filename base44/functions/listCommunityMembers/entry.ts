import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Retourne uniquement les champs nécessaires à l'onglet Membres.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Connexion requise' }, { status: 401 });

    const users = await base44.asServiceRole.entities.User.list('-created_date', 100);
    if (!Array.isArray(users)) throw new Error('Réponse invalide lors du chargement des membres.');
    const members = users.map((user: any) => ({
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      profile_photo_url: user.profile_photo_url || '',
      role: user.role,
      is_membre: Boolean(user.is_membre),
    }));

    return Response.json({ members });
  } catch (error) {
    console.error('[listCommunityMembers] Chargement des membres impossible.', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Erreur interne',
    }, { status: 500 });
  }
}
