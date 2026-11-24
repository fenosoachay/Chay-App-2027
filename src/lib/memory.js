// Memory (section Enfants) : retrouver les paires de cartes. Règles pures, testables hors navigateur.
// Chaque carte : un émoji, un nom, et ce que la Bible en dit (affiché quand la paire est trouvée).
// Dix catégories de 12 cartes (12 paires au niveau Difficile) ; dans une catégorie, chaque émoji est unique.

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
  {
    id: "personnages",
    titre: "Personnages et métiers",
    emoji: "👥",
    cartes: [
      { id: "roi", emoji: "🤴", nom: "Le roi", info: "Le roi Salomon a demandé à Dieu la sagesse pour bien gouverner.", ref: "1 Rois 3:9" },
      { id: "reine", emoji: "👸", nom: "La reine", info: "La reine Esther a eu le courage de sauver son peuple.", ref: "Esther 4:16" },
      { id: "pecheur", emoji: "🎣", nom: "Le pêcheur", info: "Jésus a dit : « Suivez-moi, je ferai de vous des pêcheurs d'hommes. »", ref: "Matthieu 4:19" },
      { id: "charpentier", emoji: "🪚", nom: "Le charpentier", info: "On appelait Jésus « le fils du charpentier ».", ref: "Matthieu 13:55" },
      { id: "berger", emoji: "🐑", nom: "Le berger", info: "Jésus est le bon berger : il donne sa vie pour ses brebis.", ref: "Jean 10:11" },
      { id: "soldat", emoji: "⚔️", nom: "Le soldat", info: "Un officier romain a cru que Jésus pouvait guérir son serviteur d'une seule parole.", ref: "Matthieu 8:8" },
      { id: "medecin", emoji: "🩺", nom: "Le médecin", info: "Luc était appelé « le médecin bien-aimé ».", ref: "Colossiens 4:14" },
      { id: "bebe", emoji: "👶", nom: "Le bébé", info: "Moïse bébé a été caché dans un panier au bord du fleuve.", ref: "Exode 2:3" },
      { id: "prophete", emoji: "🧔", nom: "Le prophète", info: "Le prophète Élie a prié, et Dieu a envoyé le feu du ciel.", ref: "1 Rois 18:38" },
      { id: "semeur", emoji: "🌱", nom: "Le semeur", info: "Le semeur sème la parole de Dieu dans les cœurs.", ref: "Luc 8:11" },
      { id: "impots", emoji: "💰", nom: "Le collecteur", info: "Zachée, chef des collecteurs d'impôts, est monté dans un arbre pour voir Jésus.", ref: "Luc 19:4" },
      { id: "potier", emoji: "🏺", nom: "Le potier", info: "Comme l'argile dans la main du potier, vous êtes dans la main de Dieu.", ref: "Jérémie 18:6" },
    ],
  },
  {
    id: "noel-paques",
    titre: "Noël et Pâques",
    emoji: "🌟",
    cartes: [
      { id: "mangeoire", emoji: "🌾", nom: "La crèche", info: "Marie a couché Jésus dans une crèche, une mangeoire.", ref: "Luc 2:7" },
      { id: "ange", emoji: "👼", nom: "L'ange", info: "Un ange a dit aux bergers : « Il vous est né un Sauveur. »", ref: "Luc 2:11" },
      { id: "etoile", emoji: "🌟", nom: "L'étoile", info: "En voyant l'étoile, les mages ont été remplis d'une très grande joie.", ref: "Matthieu 2:10" },
      { id: "cadeaux", emoji: "🎁", nom: "Les cadeaux", info: "Les mages ont offert à Jésus de l'or, de l'encens et de la myrrhe.", ref: "Matthieu 2:11" },
      { id: "emmanuel", emoji: "👶", nom: "Emmanuel", info: "On l'appellera Emmanuel, ce qui veut dire « Dieu avec nous ».", ref: "Matthieu 1:23" },
      { id: "marie", emoji: "🤱", nom: "Marie", info: "Marie a dit : « Je suis la servante du Seigneur. »", ref: "Luc 1:38" },
      { id: "bergers", emoji: "🐑", nom: "Les bergers", info: "Les bergers sont allés en hâte à Bethléem voir l'enfant.", ref: "Luc 2:16" },
      { id: "rameaux", emoji: "🌿", nom: "Les rameaux", info: "La foule a pris des branches de palmier pour accueillir Jésus.", ref: "Jean 12:13" },
      { id: "repas", emoji: "🍷", nom: "Le dernier repas", info: "Jésus a partagé le pain et la coupe avec ses disciples.", ref: "Luc 22:19" },
      { id: "croix", emoji: "✝️", nom: "La croix", info: "Jésus a porté nos péchés sur la croix.", ref: "1 Pierre 2:24" },
      { id: "tombeau", emoji: "🪨", nom: "Le tombeau vide", info: "La pierre était roulée : Jésus est ressuscité !", ref: "Luc 24:6" },
      { id: "coq", emoji: "🐓", nom: "Le coq", info: "Le coq a chanté quand Pierre a dit trois fois qu'il ne connaissait pas Jésus.", ref: "Luc 22:60" },
    ],
  },
  {
    id: "miracles",
    titre: "Miracles de Jésus",
    emoji: "✨",
    cartes: [
      { id: "vin", emoji: "🍷", nom: "L'eau en vin", info: "Aux noces de Cana, Jésus a changé l'eau en vin.", ref: "Jean 2:9" },
      { id: "tempete", emoji: "🌊", nom: "La tempête", info: "Jésus a dit au vent et à la mer : « Silence, tais-toi ! »", ref: "Marc 4:39" },
      { id: "marcher", emoji: "🚶", nom: "Marcher sur l'eau", info: "Jésus est venu vers ses disciples en marchant sur la mer.", ref: "Matthieu 14:25" },
      { id: "pains", emoji: "🧺", nom: "Les pains", info: "Avec cinq pains et deux poissons, Jésus a nourri cinq mille hommes.", ref: "Matthieu 14:21" },
      { id: "peche", emoji: "🎣", nom: "La grande pêche", info: "Il y avait tant de poissons que les filets se déchiraient.", ref: "Luc 5:6" },
      { id: "aveugle", emoji: "👁️", nom: "L'aveugle", info: "Jésus a rendu la vue à Bartimée, l'aveugle.", ref: "Marc 10:52" },
      { id: "paralyse", emoji: "🛏️", nom: "Le paralysé", info: "Jésus a dit : « Lève-toi, prends ton lit et marche. »", ref: "Jean 5:8" },
      { id: "lazare", emoji: "🙌", nom: "Lazare", info: "Jésus a crié : « Lazare, sors ! » et Lazare est sorti vivant.", ref: "Jean 11:43" },
      { id: "lepreux", emoji: "🙏", nom: "Les dix lépreux", info: "Sur dix malades guéris, un seul est revenu dire merci à Jésus.", ref: "Luc 17:15" },
      { id: "fillette", emoji: "👧", nom: "La fillette", info: "Jésus a dit à la fille de Jaïrus : « Lève-toi ! »", ref: "Marc 5:41" },
      { id: "sourd", emoji: "👂", nom: "Le sourd", info: "Jésus a dit au sourd : « Effata », c'est-à-dire « Ouvre-toi ! »", ref: "Marc 7:34" },
      { id: "piece", emoji: "🪙", nom: "La pièce", info: "Pierre a trouvé une pièce dans la bouche d'un poisson.", ref: "Matthieu 17:27" },
    ],
  },
  {
    id: "nourriture",
    titre: "Nourriture de la Bible",
    emoji: "🍯",
    cartes: [
      { id: "manne", emoji: "🥣", nom: "La manne", info: "Dans le désert, Dieu a donné la manne, le pain venu du ciel.", ref: "Exode 16:15" },
      { id: "miel", emoji: "🍯", nom: "Le miel", info: "Jean-Baptiste mangeait des sauterelles et du miel sauvage.", ref: "Marc 1:6" },
      { id: "lait", emoji: "🥛", nom: "Le lait", info: "Dieu a promis un pays où coulent le lait et le miel.", ref: "Exode 3:8" },
      { id: "poisson", emoji: "🐟", nom: "Le poisson grillé", info: "Jésus ressuscité a mangé du poisson grillé avec ses disciples.", ref: "Luc 24:42" },
      { id: "raisin", emoji: "🍇", nom: "Le raisin", info: "Les espions ont rapporté une grappe si grosse qu'il fallait deux hommes pour la porter.", ref: "Nombres 13:23" },
      { id: "lentilles", emoji: "🍲", nom: "Les lentilles", info: "Ésaü a échangé son droit d'aîné contre un plat de lentilles.", ref: "Genèse 25:34" },
      { id: "pain", emoji: "🍞", nom: "Le pain", info: "Donne-nous aujourd'hui notre pain de ce jour.", ref: "Matthieu 6:11" },
      { id: "huile", emoji: "🫒", nom: "L'huile", info: "Dieu a multiplié l'huile de la veuve jusqu'à remplir tous les vases.", ref: "2 Rois 4:6" },
      { id: "cailles", emoji: "🐦", nom: "Les cailles", info: "Le soir, des cailles sont venues couvrir le camp d'Israël.", ref: "Exode 16:13" },
      { id: "eau", emoji: "💧", nom: "L'eau du rocher", info: "Moïse a frappé le rocher, et l'eau en est sortie.", ref: "Exode 17:6" },
      { id: "sel", emoji: "🧂", nom: "Le sel", info: "Jésus a dit : « Vous êtes le sel de la terre. »", ref: "Matthieu 5:13" },
      { id: "ble", emoji: "🌾", nom: "Le blé", info: "Le grain de blé tombé en terre porte beaucoup de fruit.", ref: "Jean 12:24" },
    ],
  },
  {
    id: "musique",
    titre: "Musique et louange",
    emoji: "🎵",
    cartes: [
      { id: "harpe", emoji: "🎶", nom: "La harpe", info: "David jouait de la harpe pour calmer le roi Saül.", ref: "1 Samuel 16:23" },
      { id: "trompettes", emoji: "🎺", nom: "Les trompettes", info: "Les trompettes ont sonné et les murailles de Jéricho sont tombées.", ref: "Josué 6:20" },
      { id: "tambourin", emoji: "🥁", nom: "Le tambourin", info: "Miriam a pris un tambourin, et toutes les femmes ont dansé.", ref: "Exode 15:20" },
      { id: "chant", emoji: "🎵", nom: "Le chant", info: "Chantez à l'Éternel un cantique nouveau !", ref: "Psaume 96:1" },
      { id: "applaudir", emoji: "👏", nom: "Battre des mains", info: "Vous tous, peuples, battez des mains !", ref: "Psaume 47:2" },
      { id: "danse", emoji: "💃", nom: "La danse", info: "David dansait de toutes ses forces devant l'Éternel.", ref: "2 Samuel 6:14" },
      { id: "cor", emoji: "📯", nom: "Le cor", info: "Louez Dieu au son de la trompette !", ref: "Psaume 150:3" },
      { id: "priere", emoji: "🙏", nom: "La prière", info: "À minuit, Paul et Silas priaient et chantaient en prison.", ref: "Actes 16:25" },
      { id: "anges", emoji: "👼", nom: "Les anges", info: "Les anges chantaient : « Gloire à Dieu au plus haut des cieux ! »", ref: "Luc 2:14" },
      { id: "mains", emoji: "🙌", nom: "Les mains levées", info: "J'élèverai mes mains en ton nom.", ref: "Psaume 63:5" },
      { id: "psaumes", emoji: "📖", nom: "Les Psaumes", info: "Que tout ce qui respire loue l'Éternel !", ref: "Psaume 150:6" },
      { id: "cordes", emoji: "🎻", nom: "Les cordes", info: "Louez Dieu avec les instruments à cordes !", ref: "Psaume 150:4" },
    ],
  },
  {
    id: "plantes",
    titre: "Plantes et arbres",
    emoji: "🌿",
    cartes: [
      { id: "cedre", emoji: "🌲", nom: "Le cèdre", info: "Le temple de Salomon a été bâti avec du bois de cèdre du Liban.", ref: "1 Rois 5:6" },
      { id: "palmier", emoji: "🌴", nom: "Le palmier", info: "Les justes poussent comme le palmier.", ref: "Psaume 92:13" },
      { id: "arbre-vie", emoji: "🌳", nom: "L'arbre de vie", info: "Au milieu du jardin d'Éden, il y avait l'arbre de vie.", ref: "Genèse 2:9" },
      { id: "olivier", emoji: "🫒", nom: "L'olivier", info: "Je suis comme un olivier verdoyant dans la maison de Dieu.", ref: "Psaume 52:10" },
      { id: "moutarde", emoji: "🌱", nom: "La moutarde", info: "Une foi grande comme un grain de moutarde peut déplacer une montagne.", ref: "Matthieu 17:20" },
      { id: "rose", emoji: "🌹", nom: "La rose", info: "Je suis la rose de Saron, le lis des vallées.", ref: "Cantique 2:1" },
      { id: "epis", emoji: "🌾", nom: "Les épis", info: "Les disciples cueillaient des épis en traversant les champs.", ref: "Matthieu 12:1" },
      { id: "sycomore", emoji: "🍃", nom: "Le sycomore", info: "Zachée est monté sur un sycomore pour voir passer Jésus.", ref: "Luc 19:4" },
      { id: "roseau", emoji: "🎋", nom: "Le roseau", info: "Jésus ne brisera pas le roseau cassé.", ref: "Matthieu 12:20" },
      { id: "epines", emoji: "🌵", nom: "Les épines", info: "Les soldats ont mis une couronne d'épines sur la tête de Jésus.", ref: "Jean 19:2" },
      { id: "hysope", emoji: "🌿", nom: "L'hysope", info: "Purifie-moi avec l'hysope, et je serai pur.", ref: "Psaume 51:9" },
      { id: "fleurs", emoji: "🌼", nom: "Les fleurs", info: "L'herbe sèche, la fleur tombe, mais la parole de Dieu demeure.", ref: "Ésaïe 40:8" },
    ],
  },
  {
    id: "maison",
    titre: "La maison",
    emoji: "🏠",
    cartes: [
      { id: "lampe", emoji: "🪔", nom: "La lampe", info: "On ne cache pas la lampe : on la met en haut pour éclairer toute la maison.", ref: "Matthieu 5:15" },
      { id: "jarre", emoji: "🏺", nom: "Les jarres", info: "Aux noces de Cana, il y avait six grandes jarres de pierre.", ref: "Jean 2:6" },
      { id: "barque", emoji: "🛶", nom: "La barque", info: "Jésus enseignait la foule assis dans une barque.", ref: "Luc 5:3" },
      { id: "piece", emoji: "🪙", nom: "La pièce perdue", info: "Une femme a balayé toute sa maison pour retrouver sa pièce perdue.", ref: "Luc 15:8" },
      { id: "table", emoji: "🍽️", nom: "La table", info: "Tu dresses devant moi une table.", ref: "Psaume 23:5" },
      { id: "porte", emoji: "🚪", nom: "La porte", info: "Jésus dit : « Je me tiens à la porte et je frappe. »", ref: "Apocalypse 3:20" },
      { id: "toit", emoji: "🏠", nom: "Le toit", info: "Des amis ont fait descendre un paralysé par le toit, jusqu'à Jésus.", ref: "Marc 2:4" },
      { id: "roc", emoji: "🪨", nom: "Le roc", info: "L'homme sage a bâti sa maison sur le roc.", ref: "Matthieu 7:24" },
      { id: "puits", emoji: "🪣", nom: "Le puits", info: "Jésus a parlé avec une femme samaritaine près du puits de Jacob.", ref: "Jean 4:6" },
      { id: "sandales", emoji: "👡", nom: "Les sandales", info: "Dieu a dit à Moïse : « Ôte tes sandales, ce lieu est saint. »", ref: "Exode 3:5" },
      { id: "tunique", emoji: "👘", nom: "La tunique", info: "Jacob a donné à Joseph une belle tunique de plusieurs couleurs.", ref: "Genèse 37:3" },
      { id: "panier", emoji: "🧺", nom: "Le panier", info: "Paul s'est échappé de la ville dans un panier descendu le long de la muraille.", ref: "Actes 9:25" },
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

/** Vrai si aucune case ne montre la même image qu'à la partie précédente (`precedent` : paires par case). */
export function toutesDeplacees(cartes, precedent) {
  if (!Array.isArray(precedent) || !precedent.length) return true;
  return cartes.every((c, i) => c.paire !== precedent[i]);
}

/**
 * Place les cartes pour qu'AUCUNE image ne retombe à la même place qu'à la partie précédente.
 * Mélanges au hasard jusqu'à y arriver, puis (filet de sécurité) échanges qui corrigent les cases restantes.
 */
export function placerSansRepetition(cartes, precedent, hasard = Math.random) {
  if (!Array.isArray(precedent) || !precedent.length) return melanger(cartes, hasard);
  let t = melanger(cartes, hasard);
  for (let essai = 0; essai < 500 && !toutesDeplacees(t, precedent); essai += 1) t = melanger(cartes, hasard);
  for (let tour = 0; tour < t.length * 4 && !toutesDeplacees(t, precedent); tour += 1) {
    const i = t.findIndex((c, k) => c.paire === precedent[k]);
    const j = t.findIndex((c, k) => k !== i && c.paire !== precedent[i] && t[i].paire !== precedent[k]);
    if (j === -1) break;
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

/**
 * Jeu de cartes : `paires` cartes du thème, chacune en double, mélangées. Chaque carte : { cle, paire, ...carte }.
 * `precedent` (facultatif) : paires par case de la partie précédente ; aucune image n'y retombe à la même place.
 */
export function distribuer(theme, paires, hasard = Math.random, precedent = null) {
  const choisies = melanger(theme.cartes, hasard).slice(0, Math.min(paires, theme.cartes.length));
  const doubles = choisies.flatMap((c) => [{ ...c, cle: `${c.id}-a`, paire: c.id }, { ...c, cle: `${c.id}-b`, paire: c.id }]);
  return placerSansRepetition(doubles, precedent, hasard);
}

/* Dernière disposition jouée (sur ce téléphone), pour ne jamais la refaire : { "animaux:facile": [paires…] }. */
const CLE_DISPOSITION = "chay_memory_dispositions";
export function lireDisposition(themeId, niveauId) {
  try { return (JSON.parse(localStorage.getItem(CLE_DISPOSITION) || "{}") || {})[`${themeId}:${niveauId}`] || null; } catch { return null; }
}
export function noterDisposition(themeId, niveauId, cartes) {
  try {
    const toutes = JSON.parse(localStorage.getItem(CLE_DISPOSITION) || "{}") || {};
    toutes[`${themeId}:${niveauId}`] = cartes.map((c) => c.paire);
    localStorage.setItem(CLE_DISPOSITION, JSON.stringify(toutes));
  } catch { /* stockage indisponible : la disposition précédente reste en mémoire dans le jeu */ }
}

/**
 * Plateau qui tient en entier dans la zone (largeur x hauteur, en px), sans défilement : nombre de colonnes
 * donnant les plus grandes cartes (format 3:4), avec une taille maximale pour rester bien proportionné.
 */
export function disposition(nombre, largeur, hauteur, { ecart = 8, ratio = 3 / 4, max = 190 } = {}) {
  // Rangées complètes préférées : une grille avec une rangée incomplète doit donner des cartes 25 % plus grandes.
  let meilleur = { colonnes: 1, rangees: nombre, largeurCarte: 0, hauteurCarte: 0 };
  let score = -1;
  for (let colonnes = 2; colonnes <= nombre; colonnes += 1) {
    const rangees = Math.ceil(nombre / colonnes);
    const parLargeur = (largeur - ecart * (colonnes - 1)) / colonnes;
    const parHauteur = ((hauteur - ecart * (rangees - 1)) / rangees) * ratio;
    const l = Math.max(0, Math.floor(Math.min(parLargeur, parHauteur, max)));
    const s = nombre % colonnes === 0 ? l : l * 0.8;
    if (s > score) { score = s; meilleur = { colonnes, rangees, largeurCarte: l, hauteurCarte: Math.floor(l / ratio) }; }
  }
  return meilleur;
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

/*
 * Meilleurs scores : { "animaux:facile": { essais, secondes } }. Depuis 1.3.26, ceux de l'enfant qui joue,
 * enregistrés sur le compte (src/lib/profilsEnfants.js) : Chay Enfants « branche » ses records ici. Sans enfant
 * choisi : sur ce téléphone, comme avant.
 */
const CLE = "chay_memory_records";
let magasin = null; // { lire: () => records, ecrire: (records) => void }
export function brancherRecords(m) { magasin = m || null; }
export function lireRecords() {
  if (magasin) return { ...(magasin.lire() || {}) };
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
    if (magasin) magasin.ecrire(records);
    else {
      try { localStorage.setItem(CLE, JSON.stringify(records)); } catch { /* stockage indisponible */ }
    }
  }
  return mieux;
}
