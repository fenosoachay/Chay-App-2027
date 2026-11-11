// Dernières données de la page Multimédia, gardées EN MÉMOIRE (pas de stockage) pour l'affichage immédiat
// à la visite suivante. Liées au compte : jamais les favoris d'un autre membre (téléphone partagé).

let memoire = null;

export function lireMemoireMedia(userId) {
  if (!userId || !memoire || memoire.userId !== userId) return null;
  return memoire.donnees;
}

export function ecrireMemoireMedia(userId, donnees) {
  memoire = userId ? { userId, donnees } : null;
}

/** Déconnexion, tests. */
export function viderMemoireMedia() {
  memoire = null;
}
