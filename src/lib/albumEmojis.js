// Album des personnages du jeu Émojis (1.3.31) : chaque personnage biblique trouvé (bonne réponse) entre dans
// l'album du membre, pour toujours ; l'album montre « 12 sur 80 découverts ». Gardé sur le compte
// (collection ProgresJeu, jeu « emoji » : { trouves: { [personnage]: "AAAA-MM-JJ" } }).
// Règles pures (testées par albumEmojis.test.js) ; enregistrement : src/lib/progresJeu.js.

const cle = (nom) => String(nom || "").trim();

/** Personnages du jeu (une fois chacun), triés par nom, avec les émojis de leur première énigme. */
export function personnages(questions) {
  const vus = new Map();
  for (const q of questions || []) {
    const nom = cle(q?.answer);
    if (nom && !vus.has(nom)) vus.set(nom, { nom, emojis: String(q.emojis || "") });
  }
  return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

/** Ajoute un personnage trouvé ; renvoie { trouves, nouveau } (nouveau = il n'était pas encore dans l'album). */
export function ajouterAuAlbum(trouves, nom, jour) {
  const n = cle(nom);
  if (!n || trouves?.[n]) return { trouves: trouves || {}, nouveau: false };
  return { trouves: { ...(trouves || {}), [n]: jour }, nouveau: true };
}

/** Nombre de personnages découverts parmi ceux du jeu. */
export function decouverts(trouves, liste) {
  return (liste || []).filter((p) => trouves?.[p.nom]).length;
}
