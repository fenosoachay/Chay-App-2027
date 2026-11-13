// Réorganisation par l'admin d'une collection qui a un champ `order` (Actualité chrétienne, Fonds d'écran) :
// seules les lignes dont le rang change sont réécrites. Fichier pur (l'écriture est passée en paramètre).

/** [{ id, order }] des lignes à réécrire pour que `liste` (nouvel ordre) soit l'ordre affiché. */
export function changementsOrdre(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((x, i) => ({ id: x.id, order: i, avant: x.order }))
    .filter((x) => x.id && x.avant !== x.order)
    .map(({ id, order }) => ({ id, order }));
}

/**
 * Enregistre le nouvel ordre avec `mettreAJour(id, { order })` ; renvoie la liste avec les nouveaux rangs.
 * Lève une erreur si une écriture échoue (l'appelant recharge alors la liste).
 */
export async function enregistrerOrdreChamp(liste, mettreAJour) {
  const changes = changementsOrdre(liste);
  const res = await Promise.all(changes.map((c) => mettreAJour(c.id, { order: c.order }).then(() => true, () => false)));
  if (res.includes(false)) throw new Error("Une partie de l'ordre n'a pas été enregistrée.");
  return liste.map((x, i) => ({ ...x, order: i }));
}
