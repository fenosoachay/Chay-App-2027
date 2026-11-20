// Qui voit un contenu (Musique, Prédications, Vidéos, YouTube, Galerie, Articles) : champ `audience`.
//  - « tous »   : « Utilisateur », c.-à-d. tous les comptes inscrits — aussi les anciens contenus sans valeur ;
//  - « membre » : les membres et les VIP ;
//  - « vip »    : les VIP seulement.
// Le niveau d'un compte (users.niveau : tous / membre / vip) est donné par les admins (Admin › Équipe ›
// Gérer les membres) ; les membres ne le voient pas. Les admins voient tout. Le SERVEUR applique ces règles
// (règles PocketBase et notifications) : l'affichage ne fait que suivre.

export const AUDIENCES = [
  { value: "tous", label: "Utilisateur" },
  { value: "membre", label: "Membre" },
  { value: "vip", label: "VIP" },
];

export const NIVEAUX = AUDIENCES; // mêmes valeurs pour le niveau d'un compte

export const libelleAudience = (v) => AUDIENCES.find((a) => a.value === v)?.label || "Utilisateur";

/** Ce compte peut-il voir ce contenu ? (même règle que le serveur) */
export function peutVoir({ role, niveau } = {}, audience) {
  const a = String(audience || "");
  if (!a || a === "tous" || role === "admin") return true;
  if (a === "membre") return niveau === "membre" || niveau === "vip";
  if (a === "vip") return niveau === "vip";
  return true;
}
