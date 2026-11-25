// Progrès d'un membre dans un jeu (1.3.31), gardé sur son compte : collection ProgresJeu
// { user_id, jeu, donnees (json) }, une ligne par membre et par jeu, visible de lui seul.
// Premier usage : l'album des personnages du jeu Émojis (donnees = { trouves }).
import { base44 } from "@/api/base44Client";

/** { id, donnees } ({ id: null, donnees: {} } si rien n'est encore enregistré). */
export async function chargerProgresJeu(userId, jeu) {
  if (!userId) return { id: null, donnees: {} };
  const rows = await base44.entities.ProgresJeu.filter({ user_id: userId, jeu }, undefined, 1);
  const r = Array.isArray(rows) ? rows[0] : rows?.items?.[0];
  return { id: r?.id || null, donnees: r?.donnees || {} };
}

/** Enregistre ; renvoie l'id de la ligne (créée la première fois). */
export async function enregistrerProgresJeu(userId, jeu, id, donnees) {
  if (!userId) return id;
  if (id) { await base44.entities.ProgresJeu.update(id, { donnees }); return id; }
  const cree = await base44.entities.ProgresJeu.create({ user_id: userId, jeu, donnees });
  return cree?.id || null;
}
