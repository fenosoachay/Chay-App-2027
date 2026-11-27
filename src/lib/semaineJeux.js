/**
 * 1.4.1 : le classement des jeux se joue à la SEMAINE seulement : il repart à zéro chaque lundi à 0 h, heure de
 * Paris (pocketbase/pb_hooks/lib/scores.js). « lundi 1er décembre » : jour de la prochaine remise à zéro.
 */
export function prochainLundi(maintenant = new Date()) {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  const jour = d.getDate() === 1 ? "1er" : String(d.getDate());
  return `lundi ${jour} ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}
