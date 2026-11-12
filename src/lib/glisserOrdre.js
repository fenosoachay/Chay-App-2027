// Réorganisation d'une liste par glisser-déposer : fonctions pures.

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

/** Écrit `champ` = nouvel indice sur les éléments présents dans `nouvelOrdre` ; les autres restent inchangés. */
export function appliquerOrdre(elements, nouvelOrdre, champ = "order") {
  const rangs = new Map(nouvelOrdre.map((x, i) => [x.id, i]));
  return elements.map((x) => (rangs.has(x.id) ? { ...x, [champ]: rangs.get(x.id) } : x));
}
