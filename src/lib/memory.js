// Memory (section Enfants) : retrouver les paires de cartes. Règles pures, testables hors navigateur.
// Chaque carte : un émoji, un nom, et ce que la Bible en dit (affiché quand la paire est trouvée).

export const THEMES = [
  {
    id: "animaux",
    titre: "Animaux de la Bible",
    emoji: "🦁",
    cartes: [
      { id: "agneau", emoji: "🐑", nom: "L'agneau", info: "Jésus est l'Agneau de Dieu qui ôte le péché du monde.", ref: "Jean 1:29" },
      { id: "lion", emoji: "🦁", nom: "Le lion", info: "Dieu a fermé la gueule des lions pour protéger Daniel.", ref: "Daniel 6:22" },
      { id: "colombe", emoji: "🕊️", nom: "La colombe", info: "La colombe est revenue vers Noé avec une feuille d'olivier.", ref: "Genèse 8:11" },
      { id: "poisson", emoji: "🐟", nom: "Les poissons", info: "Jésus a nourri une foule avec cinq pains et deux poissons.", ref: "Jean 6:9" },
      { id: "baleine", emoji: "🐋", nom: "Le grand poisson", info: "Jonas est resté trois jours dans le ventre du grand poisson.", ref: "Jonas 2:1" },
      { id: "serpent", emoji: "🐍", nom: "Le serpent", info: "Le serpent a trompé Ève dans le jardin d'Éden.", ref: "Genèse 3:1" },
      { id: "chameau", emoji: "🐫", nom: "Le chameau", info: "Rébecca a donné à boire aux chameaux du serviteur d'Abraham.", ref: "Genèse 24:19" },
      { id: "ane", emoji: "🐴", nom: "L'ânon", info: "Jésus est entré à Jérusalem sur un petit âne.", ref: "Jean 12:14" },
      { id: "corbeau", emoji: "🐦", nom: "Les corbeaux", info: "Des oiseaux apportaient du pain et de la viande à Élie.", ref: "1 Rois 17:6" },
      { id: "grenouille", emoji: "🐸", nom: "Les grenouilles", info: "Les grenouilles ont envahi l'Égypte pendant les plaies.", ref: "Exode 8:2" },
      { id: "ours", emoji: "🐻", nom: "L'ours", info: "David, jeune berger, protégeait ses moutons du lion et de l'ours.", ref: "1 Samuel 17:34" },
      { id: "abeille", emoji: "🐝", nom: "Les abeilles", info: "Dieu a promis un pays où coulent le lait et le miel.", ref: "Exode 3:8" },
    ],
  },
  {
    id: "objets",
    titre: "Objets de la Bible",
    emoji: "👑",
    cartes: [
      { id: "arche", emoji: "⛵", nom: "L'arche", info: "Noé a construit l'arche comme Dieu le lui avait demandé.", ref: "Genèse 6:22" },
      { id: "arc", emoji: "🌈", nom: "L'arc-en-ciel", info: "L'arc-en-ciel est le signe de la promesse de Dieu à Noé.", ref: "Genèse 9:13" },
      { id: "etoile", emoji: "⭐", nom: "L'étoile", info: "Une étoile a guidé les mages jusqu'à Jésus.", ref: "Matthieu 2:10" },
      { id: "pain", emoji: "🍞", nom: "Le pain", info: "Jésus a dit : « Je suis le pain de vie. »", ref: "Jean 6:35" },
      { id: "raisin", emoji: "🍇", nom: "La vigne", info: "Jésus a dit : « Je suis le cep, vous êtes les sarments. »", ref: "Jean 15:5" },
      { id: "couronne", emoji: "👑", nom: "La couronne", info: "David, le petit berger, est devenu roi d'Israël.", ref: "2 Samuel 5:3" },
      { id: "lampe", emoji: "🕯️", nom: "La lampe", info: "Ta parole est une lampe à mes pieds.", ref: "Psaume 119:105" },
      { id: "rouleau", emoji: "📜", nom: "Le rouleau", info: "Jésus a lu le livre du prophète Ésaïe à la synagogue.", ref: "Luc 4:17" },
      { id: "bouclier", emoji: "🛡️", nom: "Le bouclier", info: "Prenez le bouclier de la foi.", ref: "Éphésiens 6:16" },
      { id: "feu", emoji: "🔥", nom: "Le buisson ardent", info: "Dieu a parlé à Moïse depuis un buisson en feu.", ref: "Exode 3:2" },
      { id: "pierre", emoji: "🪨", nom: "La pierre", info: "David a vaincu Goliath avec une fronde et une pierre.", ref: "1 Samuel 17:49" },
      { id: "cle", emoji: "🗝️", nom: "Les clés", info: "Jésus a promis à Pierre les clés du royaume des cieux.", ref: "Matthieu 16:19" },
    ],
  },
  {
    id: "creation",
    titre: "La Création",
    emoji: "🌍",
    cartes: [
      { id: "soleil", emoji: "☀️", nom: "Le soleil", info: "Dieu a fait le soleil pour éclairer le jour.", ref: "Genèse 1:16" },
      { id: "lune", emoji: "🌙", nom: "La lune", info: "Dieu a fait la lune pour éclairer la nuit.", ref: "Genèse 1:16" },
      { id: "etoiles", emoji: "✨", nom: "Les étoiles", info: "Dieu compte les étoiles et les appelle par leur nom.", ref: "Psaume 147:4" },
      { id: "arbre", emoji: "🌳", nom: "Les arbres", info: "Dieu a fait pousser les arbres qui portent du fruit.", ref: "Genèse 1:12" },
      { id: "fleur", emoji: "🌸", nom: "Les fleurs", info: "Regardez les lis des champs : Dieu les habille.", ref: "Matthieu 6:28" },
      { id: "mer", emoji: "🌊", nom: "La mer", info: "Dieu a rassemblé les eaux et les a appelées mers.", ref: "Genèse 1:10" },
      { id: "oiseau", emoji: "🐦", nom: "Les oiseaux", info: "Votre Père céleste nourrit les oiseaux du ciel.", ref: "Matthieu 6:26" },
      { id: "terre", emoji: "🌍", nom: "La terre", info: "Au commencement, Dieu créa les cieux et la terre.", ref: "Genèse 1:1" },
      { id: "pomme", emoji: "🍎", nom: "Les fruits", info: "Dieu a donné les fruits des arbres pour nourriture.", ref: "Genèse 1:29" },
      { id: "nuage", emoji: "☁️", nom: "Les nuages", info: "Dieu couvre le ciel de nuages et prépare la pluie.", ref: "Psaume 147:8" },
      { id: "papillon", emoji: "🦋", nom: "Les petites bêtes", info: "Dieu a fait tous les animaux, petits et grands.", ref: "Genèse 1:25" },
      { id: "humain", emoji: "🧒", nom: "L'être humain", info: "Dieu a créé l'homme à son image.", ref: "Genèse 1:27" },
    ],
  },
];

export const NIVEAUX = [
  { id: "facile", titre: "Facile", paires: 6, colonnes: 3 },
  { id: "moyen", titre: "Moyen", paires: 8, colonnes: 4 },
  { id: "difficile", titre: "Difficile", paires: 12, colonnes: 4 },
];

/** Mélange (Fisher-Yates). `hasard` : fonction 0..1 (Math.random par défaut). */
export function melanger(liste, hasard = Math.random) {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

/** Jeu de cartes : `paires` cartes du thème, chacune en double, mélangées. Chaque carte : { cle, paire, ...carte }. */
export function distribuer(theme, paires, hasard = Math.random) {
  const choisies = melanger(theme.cartes, hasard).slice(0, Math.min(paires, theme.cartes.length));
  const doubles = choisies.flatMap((c) => [{ ...c, cle: `${c.id}-a`, paire: c.id }, { ...c, cle: `${c.id}-b`, paire: c.id }]);
  return melanger(doubles, hasard);
}

/** Étoiles gagnées (1 à 3) selon le nombre d'essais (un essai = deux cartes retournées). */
export function etoiles(essais, paires) {
  if (essais <= Math.ceil(paires * 1.5)) return 3;
  if (essais <= Math.ceil(paires * 2.2)) return 2;
  return 1;
}

/** Durée lisible : 75 -> « 1 min 15 s ». */
export function duree(secondes) {
  const s = Math.max(0, Math.floor(secondes));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/* Meilleurs scores (sur ce téléphone) : { "animaux:facile": { essais, secondes } }. */
const CLE = "chay_memory_records";
export function lireRecords() {
  try { return JSON.parse(localStorage.getItem(CLE) || "{}") || {}; } catch { return {}; }
}
/** Enregistre si c'est mieux (moins d'essais, puis plus rapide). Renvoie true si c'est un nouveau record. */
export function noterRecord(themeId, niveauId, essais, secondes) {
  const records = lireRecords();
  const k = `${themeId}:${niveauId}`;
  const r = records[k];
  const mieux = !r || essais < r.essais || (essais === r.essais && secondes < r.secondes);
  if (mieux) {
    records[k] = { essais, secondes };
    try { localStorage.setItem(CLE, JSON.stringify(records)); } catch { /* stockage indisponible */ }
  }
  return mieux;
}
