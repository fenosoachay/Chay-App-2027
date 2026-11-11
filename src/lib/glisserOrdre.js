// Réorganisation d'une liste (glisser ou boutons monter / descendre) : fonctions pures.

/** Copie de `liste` où l'élément `de` est placé à l'indice `vers` (bornes respectées). */
export function deplacer(liste, de, vers) {
  const copie = [...liste];
  if (de < 0 || de >= copie.length) return copie;
  const cible = Math.max(0, Math.min(copie.length - 1, vers));
  if (cible === de) return copie;
  const [element] = copie.splice(de, 1);
  copie.splice(cible, 0, element);
  return copie;
}

/**
 * Indice où placer l'élément glissé : nombre des AUTRES éléments dont le milieu est au-dessus du doigt.
 * @param {number[]} milieux milieu vertical de chaque élément affiché (dans l'ordre affiché)
 * @param {number} y position verticale du doigt / de la souris
 * @param {number} courant indice actuel de l'élément glissé
 */
export function positionCible(milieux, y, courant) {
  let n = 0;
  milieux.forEach((m, i) => {
    if (i !== courant && m < y) n += 1;
  });
  return n;
}

/** Vrai si l'ordre (par id) a changé. */
export const ordreChange = (avant, apres, id = (x) => x.id) =>
  avant.length !== apres.length || apres.some((x, i) => id(x) !== id(avant[i]));

/** Écrit `champ` = nouvel indice sur les éléments présents dans `nouvelOrdre` ; les autres restent inchangés. */
export function appliquerOrdre(elements, nouvelOrdre, champ = "order") {
  const rangs = new Map(nouvelOrdre.map((x, i) => [x.id, i]));
  return elements.map((x) => (rangs.has(x.id) ? { ...x, [champ]: rangs.get(x.id) } : x));
}
