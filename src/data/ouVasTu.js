// « Où vas-tu ? » (1.3.32, Chay Game) : 10 points de départ, chacun une petite histoire de 4 ou 5 choix.
// Chaque réponse ajoute des « traits » (ex. presse, coeur, oubli) ; la fin est la première dont la condition
// est vraie (la dernière est toujours possible). À la fin : le chemin parcouru (ce que chaque choix a changé),
// ce qu'on n'a pas pris en compte (facteurs qu'aucun choix n'a regardés) et un verset.
// Option : { t: texte, e: { trait: points }, note: ce que ce choix a changé, voit: [facteurs pris en compte] }.

export const DEPARTS = [
  {
    id: "magasin", titre: "Au magasin", icone: "🛒",
    contexte: "Il n'y a plus de pain ni de lait à la maison. Tu penses aller au magasin.",
    facteurs: {
      meteo: "La météo : une grosse averse est tombée en fin de journée.",
      argent: "Ton porte-monnaie : il n'y avait plus que 3 € dedans.",
      horaires: "Les horaires : le magasin ferme à 20 h précises.",
    },
    questions: [
      { q: "Tu y vas à quelle heure ?", options: [
        { t: "8 h, dès l'ouverture", e: { calme: 2 }, note: "Le matin, le magasin est presque vide.", voit: ["horaires"] },
        { t: "12 h 30, à la pause", e: { foule: 1, presse: 1 }, note: "À midi, tout le monde fait ses courses en même temps." },
        { t: "19 h 50, juste avant la fermeture", e: { presse: 2 }, note: "Juste avant la fermeture, chaque minute compte." },
      ] },
      { q: "Comment y vas-tu ?", options: [
        { t: "À pied", e: { calme: 1 }, note: "Marcher prend du temps, mais pas de parking à chercher.", voit: [] },
        { t: "En voiture", e: { presse: -1 }, note: "La voiture va vite… et te garde au sec.", voit: ["meteo"] },
        { t: "En trottinette", e: { presse: 1, fun: 1 }, note: "Rapide et amusant, mais rien pour porter les courses." },
      ] },
      { q: "Qu'est-ce que tu prends avec toi ?", options: [
        { t: "Une liste de courses", e: { organise: 2 }, note: "Avec une liste, on n'oublie rien.", voit: ["argent"] },
        { t: "Rien, je me souviendrai", e: { oubli: 2 }, note: "La mémoire est fragile quand on est pressé." },
        { t: "Mon téléphone pour voir les promos", e: { distraction: 2 }, note: "Les promos attirent l'œil… et le porte-monnaie." },
      ] },
      { q: "Au rayon, une dame âgée n'arrive pas à attraper un paquet tout en haut.", options: [
        { t: "Je l'aide tout de suite", e: { coeur: 2 }, note: "Un petit geste qui a compté pour elle." },
        { t: "Je fais semblant de ne pas la voir", e: { coeur: -1, presse: 1 }, note: "Tu as gagné 30 secondes… et perdu une occasion." },
        { t: "J'appelle un employé", e: { coeur: 1 }, note: "Tu as pensé à elle, à ta façon." },
      ] },
    ],
    fins: [
      { si: (s) => s.coeur >= 2 && s.organise >= 2, emoji: "🦸", lieu: "au rayon des héros", texte: "Grâce à ta liste, tu as tout trouvé, et la dame que tu as aidée… c'est la boulangère du quartier ! Elle t'offre le pain de la semaine prochaine.", verset: "Galates 6:9" },
      { si: (s) => s.presse >= 3, emoji: "🚪", lieu: "devant le magasin fermé", texte: "Il est 20 h 02. Le rideau descend sous ton nez. Ce soir, ce sera des tartines… sans pain.", verset: "Proverbes 21:5" },
      { si: (s) => s.distraction >= 2, emoji: "🍫", lieu: "au rayon chocolat", texte: "Trois tablettes en promotion plus tard, tu rentres… sans pain ni lait. Le téléphone a fait les courses à ta place.", verset: "Hébreux 13:5" },
      { si: (s) => s.oubli >= 2, emoji: "🥛", lieu: "à la maison… sans le lait", texte: "Tu as bien acheté du pain, des biscuits et une plante verte. Le lait ? Il t'attend encore au magasin.", verset: "Proverbes 16:3" },
      { si: (s) => s.calme >= 2, emoji: "😌", lieu: "à la caisse rapide", texte: "Pas de file, pas de stress : tu passes en caisse en deux minutes et tu rentres le sourire aux lèvres.", verset: "Ecclésiaste 3:1" },
      { si: () => true, emoji: "🏠", lieu: "à la maison, courses faites", texte: "Mission accomplie, sans exploit ni catastrophe. Une journée ordinaire… et c'est très bien comme ça.", verset: "Colossiens 3:17" },
    ],
  },
  {
    id: "maison", titre: "À la maison", icone: "🏠",
    contexte: "C'est samedi, tu es à la maison. Ta mère t'a demandé de ranger ta chambre avant midi.",
    facteurs: {
      temps: "Le temps : ranger une chambre prend en vrai une bonne heure.",
      famille: "La famille : ta petite sœur avait besoin d'aide pour ses devoirs.",
      invites: "Les invités : des amis de tes parents arrivaient à midi.",
    },
    questions: [
      { q: "Il est 9 h. Tu commences quand ?", options: [
        { t: "Tout de suite", e: { serieux: 2 }, note: "Commencer tôt, c'est déjà la moitié du travail.", voit: ["temps"] },
        { t: "Après un épisode de ma série", e: { retard: 1 }, note: "Un épisode… qui en devient souvent trois." },
        { t: "À 11 h 45, j'ai le temps", e: { retard: 2 }, note: "Quinze minutes pour une heure de travail : le calcul était risqué." },
      ] },
      { q: "Tu trouves sous ton lit un vieux jeu de société.", options: [
        { t: "Je le range avec les autres jeux", e: { serieux: 1 }, note: "Chaque chose à sa place." },
        { t: "Je fais une partie, juste une", e: { retard: 1, fun: 1 }, note: "Une partie contre toi-même : tu as gagné… et perdu du temps." },
        { t: "Je le mets de côté pour le donner", e: { coeur: 1 }, note: "Un jeu qui dort peut faire la joie d'un autre enfant." },
      ] },
      { q: "Ta petite sœur frappe à la porte : « Tu m'aides pour mon exercice ? »", options: [
        { t: "Oui, je viens", e: { coeur: 2, retard: 1 }, note: "Tu as donné de ton temps à quelqu'un qui en avait besoin.", voit: ["famille"] },
        { t: "Non, je suis occupé", e: { coeur: -1 }, note: "Tu as gardé ton temps… elle est repartie toute triste." },
        { t: "Dans 10 minutes, après ma chambre", e: { coeur: 1, serieux: 1 }, note: "Une promesse qu'il faudra tenir.", voit: ["famille"] },
      ] },
      { q: "Où mets-tu tout ce qui traîne par terre ?", options: [
        { t: "Je trie et je range vraiment", e: { serieux: 2 }, note: "Ranger pour de vrai, c'est plus long mais ça dure." },
        { t: "Tout dans le placard, porte fermée", e: { cache: 2 }, note: "Tout est invisible… jusqu'à ce que quelqu'un ouvre le placard." },
        { t: "Sous le lit, personne ne regarde", e: { cache: 1 }, note: "Le dessous du lit commence à ressembler à une grotte." },
      ] },
    ],
    fins: [
      { si: (s) => s.cache >= 2, emoji: "🧥", lieu: "à l'avalanche du placard", texte: "À midi, l'invitée ouvre ton placard pour poser son manteau… et tout lui tombe dessus. Ta mère te regarde. Longuement.", verset: "Luc 8:17" },
      { si: (s) => s.retard >= 3, emoji: "⏰", lieu: "à midi, chambre en désordre", texte: "La sonnette retentit, les invités sont là, et ta chambre ressemble encore à un champ de bataille.", verset: "Proverbes 6:6" },
      { si: (s) => s.coeur >= 3 && s.serieux >= 2, emoji: "🏆", lieu: "au sommet de la famille", texte: "Chambre impeccable ET exercice de ta sœur réussi ! Ta mère te prépare ton plat préféré pour te remercier.", verset: "Colossiens 3:23" },
      { si: (s) => s.coeur <= 0, emoji: "😢", lieu: "dans une chambre bien rangée… mais seul", texte: "Ta chambre brille, mais ta sœur a pleuré sur son exercice. Une chambre rangée ne remplace pas un cœur ouvert.", verset: "1 Jean 3:18" },
      { si: (s) => s.serieux >= 3, emoji: "✨", lieu: "dans la chambre la plus propre de la ville", texte: "Tout est rangé, trié, à sa place. Tu retrouves même la chaussette perdue depuis l'an dernier !", verset: "1 Corinthiens 14:40" },
      { si: () => true, emoji: "🙂", lieu: "à midi, presque à l'heure", texte: "La chambre est à peu près rangée, les invités sont contents. Pas parfait… mais en bon chemin.", verset: "Philippiens 1:6" },
    ],
  },
  {
    id: "eglise", titre: "À l'église", icone: "⛪",
    contexte: "Dimanche matin. Le culte commence à 10 h, et c'est toi qui dois lire un passage de la Bible devant tout le monde.",
    facteurs: {
      preparation: "La préparation : le passage à lire contenait des noms difficiles.",
      trafic: "La circulation : il y avait des travaux sur la route principale.",
      tenue: "Le téléphone : il n'était pas en mode silencieux.",
    },
    questions: [
      { q: "Samedi soir, tu fais quoi ?", options: [
        { t: "Je lis le passage à voix haute", e: { prepare: 2 }, note: "Lire à voix haute, c'est découvrir les mots difficiles à l'avance.", voit: ["preparation"] },
        { t: "Je regarde un film tard", e: { fatigue: 2 }, note: "Un bon film… et cinq heures de sommeil." },
        { t: "Je prie pour la lecture", e: { paix: 2 }, note: "Tu as confié ta lecture à Dieu." },
      ] },
      { q: "Dimanche, tu pars à quelle heure ?", options: [
        { t: "9 h 15, large", e: { avance: 2 }, note: "Partir tôt laisse de la place aux imprévus.", voit: ["trafic"] },
        { t: "9 h 45, ça suffit", e: { retard: 1 }, note: "Juste à temps… si tout va bien." },
        { t: "9 h 58, j'habite à côté", e: { retard: 2 }, note: "À côté… mais il faut encore se garer et entrer." },
      ] },
      { q: "En arrivant, un nouveau venu cherche où s'asseoir, l'air perdu.", options: [
        { t: "Je l'accueille et je l'installe", e: { coeur: 2 }, note: "Un sourire qui fait qu'on a envie de revenir." },
        { t: "Je file au premier rang, je lis bientôt", e: { stress: 1 }, note: "Tu as pensé à ta lecture avant tout." },
        { t: "Je le montre à un responsable", e: { coeur: 1 }, note: "Tu as passé le relais, c'est déjà bien." },
      ] },
      { q: "Juste avant ta lecture, ton téléphone vibre dans ta poche.", options: [
        { t: "Je le mets en silencieux sans regarder", e: { paix: 1 }, note: "Rien n'est plus urgent que ce moment.", voit: ["tenue"] },
        { t: "Je regarde vite le message", e: { distraction: 2 }, note: "Un message drôle… et ta tête est ailleurs." },
        { t: "Je l'ignore, il va s'arrêter", e: { risque: 2 }, note: "Il s'est arrêté… pour mieux recommencer." },
      ] },
    ],
    fins: [
      { si: (s) => s.risque >= 2, emoji: "📳", lieu: "en pleine lecture… avec une sonnerie", texte: "Au milieu du Psaume, ta sonnerie de poulet résonne dans toute l'église. Fou rire général, même chez le pasteur.", verset: "Ecclésiaste 3:4" },
      { si: (s) => s.retard >= 2 && s.avance < 1, emoji: "🏃", lieu: "à l'entrée, essoufflé", texte: "Tu arrives pendant qu'on cherche qui va lire à ta place. Tu lis, essoufflé, en sautant une ligne.", verset: "Proverbes 19:2" },
      { si: (s) => s.fatigue >= 2 && s.prepare < 2, emoji: "😵", lieu: "dans la forêt des noms difficiles", texte: "« Mahalaleel… Méthuschélah… » Tu butes sur chaque nom. La prochaine fois, tu liras la veille !", verset: "2 Timothée 2:15" },
      { si: (s) => s.coeur >= 2 && s.prepare >= 2, emoji: "🌟", lieu: "au cœur du culte", texte: "Ta lecture est claire et posée. Après le culte, le nouveau venu te dit : « Grâce à toi, je reviendrai. »", verset: "Romains 15:7" },
      { si: (s) => s.paix >= 2, emoji: "🕊️", lieu: "dans la paix", texte: "Malgré le trac, tu lis sans trembler. Tu as senti que tu n'étais pas seul devant tout le monde.", verset: "Philippiens 4:6" },
      { si: () => true, emoji: "📖", lieu: "au pupitre", texte: "La lecture se passe bien, sans éclat ni accident. Le passage a été entendu, c'est l'essentiel.", verset: "Ésaïe 55:11" },
    ],
  },
  {
    id: "ecole", titre: "À l'école", icone: "🎒",
    contexte: "Demain, il y a un contrôle de mathématiques. Ce soir, ton meilleur ami t'invite à jouer en ligne.",
    facteurs: {
      sommeil: "Le sommeil : le cerveau retient mieux ce qu'on apprend après une bonne nuit.",
      aide: "L'aide : ton grand frère était bon en maths et disponible.",
      reveil: "Le réveil : il n'était pas réglé.",
    },
    questions: [
      { q: "Après l'école, tu fais quoi en premier ?", options: [
        { t: "Je révise une heure", e: { travail: 2 }, note: "Une heure de travail, c'est beaucoup de points demain." },
        { t: "Je joue en ligne avec mon ami", e: { jeu: 2 }, note: "Le jeu, c'est bien… après le travail." },
        { t: "Je demande de l'aide à mon frère", e: { travail: 1, aide: 2 }, note: "Demander de l'aide, c'est être sage.", voit: ["aide"] },
      ] },
      { q: "À 21 h, ton ami insiste : « Encore une partie ! »", options: [
        { t: "Je dis non et je vais me coucher", e: { sommeil: 2 }, note: "Savoir dire non, c'est un super-pouvoir.", voit: ["sommeil"] },
        { t: "Une dernière, promis", e: { jeu: 1, sommeil: -1 }, note: "La « dernière » partie a duré une heure." },
        { t: "Je joue jusqu'à minuit", e: { jeu: 2, sommeil: -2 }, note: "Ton cerveau voulait dormir. Il n'a pas été écouté." },
      ] },
      { q: "Avant de dormir…", options: [
        { t: "Je règle mon réveil", e: { organise: 2 }, note: "Un petit geste qui sauve les matins.", voit: ["reveil"] },
        { t: "Je prépare mon sac", e: { organise: 1 }, note: "Le sac est prêt, la calculatrice aussi." },
        { t: "Je m'endors sur le téléphone", e: { sommeil: -1 }, note: "L'écran a gardé tes yeux ouverts longtemps." },
      ] },
      { q: "Pendant le contrôle, ton voisin te montre sa copie.", options: [
        { t: "Je regarde ma propre feuille", e: { honnete: 2 }, note: "Ta note sera vraiment la tienne." },
        { t: "Je recopie un peu", e: { triche: 2 }, note: "Recopier, c'est risquer… et ne rien apprendre." },
        { t: "Je lui fais signe d'arrêter", e: { honnete: 1, coeur: 1 }, note: "Tu l'as protégé, lui aussi." },
      ] },
    ],
    fins: [
      { si: (s) => s.triche >= 2, emoji: "🙈", lieu: "au bureau du professeur", texte: "Le professeur a tout vu. Zéro pour vous deux… et ton voisin s'était trompé à toutes les questions !", verset: "Proverbes 10:9" },
      { si: (s) => s.organise < 1 && s.jeu >= 2, emoji: "🏃‍♂️", lieu: "devant la porte fermée de la classe", texte: "Pas de réveil, pas de sac prêt : tu arrives avec 20 minutes de retard. Le contrôle a commencé sans toi.", verset: "Éphésiens 5:16" },
      { si: (s) => s.sommeil <= -2, emoji: "😴", lieu: "au pays des rêves… en plein contrôle", texte: "Tu t'endors sur la question 3. Tu rêves de chiffres qui dansent. La sonnerie te réveille : copie presque vide.", verset: "Psaumes 127:2" },
      { si: (s) => s.travail >= 2 && s.honnete >= 1 && s.sommeil >= 1, emoji: "🥇", lieu: "en tête de la classe", texte: "Tu reconnais chaque exercice : tu les as révisés ! Le professeur te rend un 18 sur 20 avec un grand sourire.", verset: "Proverbes 12:24" },
      { si: (s) => s.aide >= 2, emoji: "🤝", lieu: "dans l'équipe des frères", texte: "Les astuces de ton frère te sauvent deux exercices. Ce soir, c'est toi qui l'aides à faire la vaisselle.", verset: "Ecclésiaste 4:9" },
      { si: () => true, emoji: "📝", lieu: "au milieu du classement", texte: "Un 11 sur 20. Pas mal, pas génial. Tu sais maintenant ce qu'il faut changer pour le prochain contrôle.", verset: "Galates 6:7" },
    ],
  },
  {
    id: "travail", titre: "Au travail", icone: "💼",
    contexte: "Ton chef t'a confié un dossier important à rendre vendredi. Nous sommes lundi.",
    facteurs: {
      imprevu: "L'imprévu : ton ordinateur allait tomber en panne jeudi.",
      equipe: "L'équipe : un collègue connaissait très bien ce sujet.",
      sante: "La santé : tu couvais un rhume.",
    },
    questions: [
      { q: "Lundi, tu commences quand ?", options: [
        { t: "Tout de suite, je fais un plan", e: { avance: 2 }, note: "Un plan, et la semaine se dessine.", voit: ["imprevu"] },
        { t: "Mercredi, j'ai le temps", e: { retard: 1 }, note: "Il reste trois jours… s'il n'arrive rien." },
        { t: "Jeudi soir, je travaille mieux sous pression", e: { retard: 2 }, note: "La pression aide… jusqu'au premier imprévu." },
      ] },
      { q: "Un collègue te propose son aide.", options: [
        { t: "J'accepte avec joie", e: { equipe: 2 }, note: "À deux, on voit ce qu'on ne voyait pas seul.", voit: ["equipe"] },
        { t: "Je préfère faire seul", e: { orgueil: 1 }, note: "Tu voulais tout le mérite." },
        { t: "Je lui pose juste une question", e: { equipe: 1 }, note: "Une question bien posée vaut une journée de recherche.", voit: ["equipe"] },
      ] },
      { q: "Mercredi, tu te sens fatigué et tu as mal à la gorge.", options: [
        { t: "Je me couche tôt et je bois du thé", e: { sante: 2 }, note: "Prendre soin de soi, c'est aussi bien travailler.", voit: ["sante"] },
        { t: "Je fais une nuit blanche sur le dossier", e: { fatigue: 2 }, note: "Le dossier avance, ton corps recule." },
        { t: "Je continue comme d'habitude", e: { fatigue: 1 }, note: "Le rhume, lui, continue aussi." },
      ] },
      { q: "Jeudi, tu sauvegardes ton travail ?", options: [
        { t: "Oui, sur une clé et en ligne", e: { prudent: 2 }, note: "Deux copies : rien ne peut tout effacer.", voit: ["imprevu"] },
        { t: "Non, je le ferai à la fin", e: { risque: 2 }, note: "« À la fin » est parfois trop tard." },
        { t: "Je l'envoie par courriel à moi-même", e: { prudent: 1 }, note: "Une copie de secours, simple et efficace." },
      ] },
    ],
    fins: [
      { si: (s) => s.risque >= 2 && s.avance < 2, emoji: "💥", lieu: "devant un écran noir", texte: "Jeudi soir, l'ordinateur s'éteint pour toujours. Le dossier aussi. Vendredi, tu expliques… tout recommencer.", verset: "Proverbes 22:3" },
      { si: (s) => s.fatigue >= 2, emoji: "🤧", lieu: "sous ta couette, malade", texte: "Le rhume devient une grippe. Le dossier est presque fini… mais c'est ton collègue qui le présente.", verset: "Psaumes 4:8" },
      { si: (s) => s.equipe >= 2 && s.avance >= 2, emoji: "🎉", lieu: "à la réunion des félicitations", texte: "Dossier rendu mercredi, sans faute. Le chef vous félicite tous les deux devant toute l'équipe.", verset: "Proverbes 15:22" },
      { si: (s) => s.orgueil >= 1 && s.retard >= 1, emoji: "😓", lieu: "à minuit au bureau, seul", texte: "Tout seul, tout à la fin. Tu rends le dossier à 23 h 59… avec une erreur qu'un collègue aurait vue en deux minutes.", verset: "Proverbes 16:18" },
      { si: (s) => s.prudent >= 1 && s.sante >= 2, emoji: "🌞", lieu: "au week-end bien mérité", texte: "Ton ordinateur a lâché jeudi, mais ta copie t'a sauvé ! Dossier rendu, santé gardée : bon week-end.", verset: "Matthieu 11:28" },
      { si: () => true, emoji: "📁", lieu: "au bureau du chef, à l'heure", texte: "Le dossier est rendu vendredi. Correct, sans plus. La prochaine fois, tu commenceras plus tôt.", verset: "Colossiens 3:23" },
    ],
  },
  {
    id: "amis", titre: "Chez des amis", icone: "🍕",
    contexte: "Ton ami organise une soirée chez lui samedi. Tu y vas.",
    facteurs: {
      parents: "Les parents : il fallait prévenir à quelle heure tu rentrerais.",
      cadeau: "L'anniversaire : c'était aussi l'anniversaire de sa sœur.",
      trajet: "Le retour : le dernier bus passait à 23 h 10.",
    },
    questions: [
      { q: "Avant de partir…", options: [
        { t: "Je dis à mes parents où je vais et quand je rentre", e: { confiance: 2 }, note: "Tes parents sont tranquilles, et toi aussi.", voit: ["parents"] },
        { t: "Je pars vite, je leur écrirai", e: { oubli: 1 }, note: "Le message n'est jamais parti." },
        { t: "Je regarde l'heure du dernier bus", e: { prevoyant: 2 }, note: "Tu sais déjà comment rentrer.", voit: ["trajet"] },
      ] },
      { q: "Qu'est-ce que tu apportes ?", options: [
        { t: "Un gâteau fait maison", e: { coeur: 2 }, note: "Un gâteau qui a demandé du temps et de l'amour." },
        { t: "Rien, ils ont tout", e: { coeur: -1 }, note: "On n'arrive jamais les mains vides… dit le proverbe." },
        { t: "Une carte pour la sœur de mon ami", e: { coeur: 2 }, note: "Tu as pensé à quelqu'un qu'on oublie souvent.", voit: ["cadeau"] },
      ] },
      { q: "Pendant la soirée, des amis se moquent d'un garçon timide.", options: [
        { t: "Je vais parler avec lui", e: { courage: 2 }, note: "Tu as été l'ami dont il avait besoin." },
        { t: "Je ris avec les autres", e: { suivre: 2 }, note: "C'était drôle pour eux. Pas pour lui." },
        { t: "Je change de sujet", e: { courage: 1 }, note: "Tu as calmé le jeu, sans faire de bruit." },
      ] },
      { q: "Il est 23 h. On t'invite à rester « encore un peu ».", options: [
        { t: "Je rentre comme prévu", e: { confiance: 1, prevoyant: 1 }, note: "Une parole tenue vaut de l'or." },
        { t: "Je reste jusqu'à 1 h", e: { retard: 2 }, note: "La soirée était belle… et le dernier bus est parti." },
        { t: "J'appelle mes parents pour demander", e: { confiance: 2 }, note: "Demander, c'est respecter." },
      ] },
    ],
    fins: [
      { si: (s) => s.retard >= 2 && s.prevoyant < 2, emoji: "🌙", lieu: "à l'arrêt de bus désert", texte: "Le dernier bus est parti depuis longtemps. À 1 h 30, ton père arrive en pyjama pour te chercher. Il ne dit rien. C'est pire.", verset: "Proverbes 1:8" },
      { si: (s) => s.suivre >= 2, emoji: "😔", lieu: "dans un silence gênant", texte: "Le garçon timide part en premier. Le lendemain, tu apprends qu'il venait d'arriver dans la ville et ne connaissait personne.", verset: "Exode 23:2" },
      { si: (s) => s.courage >= 2 && s.coeur >= 2, emoji: "🤗", lieu: "au début d'une belle amitié", texte: "Le garçon timide rit enfin. Il s'appelle Tojo, il joue de la guitare… et devient ton ami pour des années.", verset: "Proverbes 17:17" },
      { si: (s) => s.coeur >= 2, emoji: "🎂", lieu: "au cœur de la fête", texte: "Ta carte fait pleurer de joie la sœur de ton ami : tout le monde avait oublié son anniversaire, sauf toi !", verset: "Romains 12:10" },
      { si: (s) => s.confiance >= 3, emoji: "🔑", lieu: "à la maison, à l'heure", texte: "Tu rentres comme promis. La semaine suivante, tes parents te laissent aller à la sortie au lac. La confiance, ça se gagne.", verset: "Luc 16:10" },
      { si: () => true, emoji: "🍕", lieu: "à la maison, plein de pizza", texte: "Une bonne soirée, de bons souvenirs, un peu trop de pizza. Rien de grave !", verset: "Ecclésiaste 8:15" },
    ],
  },
  {
    id: "voyage", titre: "En voyage", icone: "🧳",
    contexte: "Tu pars en voyage en train pour rendre visite à ta grand-mère, à 300 km.",
    facteurs: {
      papiers: "Les papiers : il fallait ta carte d'identité pour le billet.",
      batterie: "La batterie : ton téléphone était à 15 %.",
      gare: "La gare : il y avait deux gares dans la ville.",
    },
    questions: [
      { q: "La veille, tu prépares quoi ?", options: [
        { t: "Ma valise et mes papiers", e: { prepare: 2 }, note: "Tout est prêt, rien ne manquera.", voit: ["papiers"] },
        { t: "Rien, je prépare le matin", e: { presse: 2 }, note: "Le matin, tout va toujours plus vite que prévu." },
        { t: "Je charge mon téléphone et je télécharge le billet", e: { prepare: 1 }, note: "Un téléphone chargé est un bon compagnon.", voit: ["batterie"] },
      ] },
      { q: "Le train part à 8 h 12. Tu arrives à la gare…", options: [
        { t: "À 7 h 45", e: { avance: 2 }, note: "Le temps de trouver le quai, tranquillement." },
        { t: "À 8 h 05", e: { presse: 1 }, note: "Sept minutes pour trouver le bon quai." },
        { t: "À 8 h 10, en courant", e: { presse: 2 }, note: "Chaque seconde compte… et tu n'as pas vérifié la gare.", voit: [] },
      ] },
      { q: "Dans le train, une maman avec trois enfants n'a pas de place assise.", options: [
        { t: "Je lui laisse ma place", e: { coeur: 2 }, note: "Trois heures debout pour toi, trois heures de repos pour elle." },
        { t: "Je mets mes écouteurs", e: { coeur: -1 }, note: "La musique couvre tout… même ta conscience." },
        { t: "Je joue avec les enfants", e: { coeur: 2, fun: 1 }, note: "Les enfants rient, la maman souffle." },
      ] },
      { q: "Tu arrives. Comment trouves-tu la maison de ta grand-mère ?", options: [
        { t: "Avec l'adresse écrite sur papier", e: { prevoyant: 2 }, note: "Le papier ne tombe jamais en panne.", voit: ["batterie"] },
        { t: "Avec le GPS du téléphone", e: { risque: 1 }, note: "Tant qu'il y a de la batterie…" },
        { t: "Je demande aux passants", e: { aventure: 2 }, note: "Les gens du coin connaissent tout le monde." },
      ] },
    ],
    fins: [
      { si: (s) => s.presse >= 3, emoji: "🚆", lieu: "sur le quai, le train s'éloigne", texte: "Tu vois les portes se fermer. Mauvaise gare en plus ! Prochain train dans 4 heures. Ta grand-mère garde le gâteau au chaud.", verset: "Proverbes 21:5" },
      { si: (s) => s.risque >= 1 && s.prepare < 2, emoji: "🔋", lieu: "perdu dans une ville inconnue", texte: "Le téléphone s'éteint au milieu du trajet. Plus de GPS, plus d'adresse. Tu tournes une heure avant de trouver un café accueillant.", verset: "Psaumes 119:105" },
      { si: (s) => s.coeur >= 2 && s.fun >= 1, emoji: "🎈", lieu: "dans le wagon des copains", texte: "Les trois enfants t'ont fait dessiner des chevaux pendant tout le trajet. En descendant, la maman te dit : « Que Dieu te bénisse. »", verset: "Hébreux 13:2" },
      { si: (s) => s.aventure >= 2, emoji: "🗺️", lieu: "chez le boulanger du coin", texte: "Le boulanger connaît ta grand-mère : « Ah, la dame aux confitures ! » Il t'y conduit lui-même, avec deux croissants offerts.", verset: "Proverbes 18:24" },
      { si: (s) => s.prepare >= 2 && s.avance >= 2, emoji: "👵", lieu: "dans les bras de ta grand-mère", texte: "Aucun souci, aucune course. Tu arrives pile pour le goûter, et ta grand-mère t'attend avec ton gâteau préféré.", verset: "Psaumes 37:5" },
      { si: () => true, emoji: "🏡", lieu: "chez ta grand-mère, enfin", texte: "Un voyage avec quelques frayeurs, mais tu es arrivé. Ta grand-mère est si heureuse de te voir !", verset: "Proverbes 17:6" },
    ],
  },
  {
    id: "telephone", titre: "Au téléphone", icone: "📱",
    contexte: "Le soir, tu ouvres les réseaux sociaux « juste cinq minutes ».",
    facteurs: {
      heure: "L'heure : tu te levais à 6 h le lendemain.",
      vrai: "La vérité : la rumeur qui circulait était fausse.",
      prive: "La vie privée : ton profil était ouvert à tout le monde.",
    },
    questions: [
      { q: "Il est 22 h. Combien de temps restes-tu ?", options: [
        { t: "Cinq minutes, avec un minuteur", e: { maitrise: 2 }, note: "Le minuteur a décidé pour toi.", voit: ["heure"] },
        { t: "Jusqu'à ce que je m'ennuie", e: { temps: 2 }, note: "On ne s'ennuie jamais : c'est fait exprès." },
        { t: "Je regarde juste les messages", e: { maitrise: 1 }, note: "Rapide, utile, terminé." },
      ] },
      { q: "Une vidéo dit des choses méchantes sur un camarade.", options: [
        { t: "Je la partage, c'est drôle", e: { mal: 2 }, note: "Un clic, et la moquerie a doublé." },
        { t: "Je ne partage pas et je signale", e: { bien: 2 }, note: "Tu as arrêté le mal là où il passait.", voit: ["vrai"] },
        { t: "Je regarde sans rien faire", e: { mal: 1 }, note: "Regarder, c'est déjà un peu participer." },
      ] },
      { q: "Tu veux publier une photo de toi devant ta maison.", options: [
        { t: "Je la publie avec l'adresse", e: { risque: 2 }, note: "Tout le monde sait maintenant où tu habites." },
        { t: "Je la publie pour mes amis seulement", e: { prudent: 2 }, note: "Tes amis la voient, les inconnus non.", voit: ["prive"] },
        { t: "Je choisis une autre photo", e: { prudent: 1 }, note: "Une belle photo… sans indice." },
      ] },
      { q: "Un inconnu t'écrit : « Tu as gagné un téléphone ! Clique ici. »", options: [
        { t: "Je clique, on ne sait jamais", e: { piege: 2 }, note: "« Gratuit » cache souvent un prix." },
        { t: "Je supprime et je bloque", e: { prudent: 2 }, note: "Un réflexe qui protège." },
        { t: "J'en parle à mes parents", e: { prudent: 1, confiance: 1 }, note: "À deux, on voit mieux les pièges." },
      ] },
    ],
    fins: [
      { si: (s) => s.piege >= 2, emoji: "🎣", lieu: "dans le filet des arnaqueurs", texte: "Le lien a volé ton mot de passe. Ton compte publie maintenant des promotions de lunettes de soleil… en plein hiver.", verset: "Matthieu 10:16" },
      { si: (s) => s.mal >= 2, emoji: "💔", lieu: "dans la tristesse d'un camarade", texte: "La vidéo a fait le tour de l'école. Le lendemain, ton camarade ne vient pas en classe. Et la rumeur était fausse.", verset: "Proverbes 18:21" },
      { si: (s) => s.temps >= 2 && s.maitrise < 1, emoji: "🌅", lieu: "à 3 h du matin, les yeux rouges", texte: "« Cinq minutes » sont devenues cinq heures. Le réveil sonne dans trois heures. Tu as vu 412 vidéos de chats.", verset: "Éphésiens 5:15" },
      { si: (s) => s.risque >= 2, emoji: "🏚️", lieu: "sous le regard des inconnus", texte: "Ta photo avec l'adresse a été vue par 3 000 personnes. Tes parents te demandent de la retirer tout de suite.", verset: "Proverbes 22:3" },
      { si: (s) => s.bien >= 2 && s.prudent >= 2, emoji: "🛡️", lieu: "au club des gardiens du web", texte: "Tu as protégé un camarade, ta maison et ton compte en une seule soirée. Et tu dors à 22 h 30 !", verset: "Philippiens 4:8" },
      { si: () => true, emoji: "📴", lieu: "au lit, téléphone éteint", texte: "Une soirée en ligne sans dégât. Demain, tu essaieras peut-être de ne pas ouvrir l'application du tout.", verset: "1 Corinthiens 6:12" },
    ],
  },
  {
    id: "marche", titre: "Au marché", icone: "🧺",
    contexte: "Ta mère te donne 20 000 Ar pour acheter des légumes au marché.",
    facteurs: {
      prix: "Les prix : on peut comparer avant d'acheter.",
      poche: "La poche : les voleurs aiment les marchés bondés.",
      monnaie: "La monnaie : la vendeuse s'était trompée en te rendant.",
    },
    questions: [
      { q: "Où ranges-tu l'argent ?", options: [
        { t: "Dans une poche fermée devant moi", e: { prudent: 2 }, note: "Personne ne peut y glisser la main.", voit: ["poche"] },
        { t: "Dans la poche arrière", e: { risque: 2 }, note: "La poche préférée… des pickpockets." },
        { t: "Dans ma main", e: { risque: 1 }, note: "On la voit, on la tient… on la pose parfois." },
      ] },
      { q: "Les tomates coûtent différemment selon les vendeuses.", options: [
        { t: "Je fais le tour et je compare", e: { sage: 2 }, note: "Cinq minutes pour économiser beaucoup.", voit: ["prix"] },
        { t: "J'achète à la première", e: { vite: 1 }, note: "Rapide, mais pas forcément bon marché." },
        { t: "Je négocie fort", e: { sage: 1, fun: 1 }, note: "La vendeuse rit et baisse un peu le prix." },
      ] },
      { q: "Un vendeur te propose un jouet « super affaire ».", options: [
        { t: "Je l'achète avec l'argent des légumes", e: { tentation: 2 }, note: "Le jouet est joli. Les légumes, eux, manqueront." },
        { t: "Je dis non merci", e: { sage: 1 }, note: "Tu sais pourquoi tu es venu." },
        { t: "Je le note pour plus tard", e: { sage: 1 }, note: "Une envie qui peut attendre." },
      ] },
      { q: "La vendeuse te rend trop de monnaie.", options: [
        { t: "Je lui rends le surplus", e: { honnete: 2 }, note: "Elle n'oubliera jamais ton visage.", voit: ["monnaie"] },
        { t: "Je garde tout, c'est sa faute", e: { malhonnete: 2 }, note: "Quelques billets… et un poids sur la conscience." },
        { t: "Je recompte et je lui montre", e: { honnete: 2 }, note: "Tu as vérifié, et tu as été juste.", voit: ["monnaie"] },
      ] },
    ],
    fins: [
      { si: (s) => s.risque >= 2 && s.prudent < 1, emoji: "👜", lieu: "les poches vides", texte: "Dans la foule, une main légère a pris ton argent. Tu rentres sans légumes. Ta mère te serre fort : « L'important, c'est que tu ailles bien. »", verset: "Proverbes 22:3" },
      { si: (s) => s.tentation >= 2, emoji: "🧸", lieu: "avec un jouet… et pas de légumes", texte: "Le jouet s'est cassé avant même d'arriver à la maison. Et ce soir, la soupe sera… à l'eau.", verset: "Proverbes 21:20" },
      { si: (s) => s.malhonnete >= 2, emoji: "😶", lieu: "dans le regret", texte: "Le soir, tu apprends que la vendeuse a dû payer de sa poche ce qui manquait. Tu y retournes demain pour réparer.", verset: "Proverbes 11:1" },
      { si: (s) => s.honnete >= 2 && s.sage >= 3, emoji: "🍅", lieu: "chez ta vendeuse préférée", texte: "La vendeuse se souvient de toi : depuis, elle te garde ses plus belles tomates et ajoute toujours une poignée de piments !", verset: "Luc 6:38" },
      { si: (s) => s.sage >= 2, emoji: "💰", lieu: "à la maison avec de la monnaie en plus", texte: "Grâce à tes comparaisons, il te reste 4 000 Ar. Ta mère te laisse les garder : bien joué !", verset: "Proverbes 13:11" },
      { si: () => true, emoji: "🥕", lieu: "à la maison, panier rempli", texte: "Les légumes sont là, la soupe sera bonne. Une sortie au marché réussie.", verset: "Psaumes 104:14" },
    ],
  },
  {
    id: "dimanche", titre: "Un dimanche après-midi", icone: "☀️",
    contexte: "C'est dimanche après-midi, il fait beau et tu n'as rien de prévu.",
    facteurs: {
      soleil: "Le soleil : il tapait très fort entre 13 h et 15 h.",
      voisin: "Le voisin : il était malade et seul depuis une semaine.",
      lundi: "Lundi : tu avais un devoir à rendre.",
    },
    questions: [
      { q: "Que fais-tu d'abord ?", options: [
        { t: "Une sieste", e: { repos: 2 }, note: "Le repos du dimanche, comme Dieu l'a voulu." },
        { t: "Un match de foot au soleil", e: { sport: 2, soleil: 1 }, note: "Courir à 14 h en plein soleil, sans casquette…" },
        { t: "Je finis mon devoir de lundi", e: { serieux: 2 }, note: "Libéré pour tout le reste de la journée.", voit: ["lundi"] },
      ] },
      { q: "Tu passes devant chez le voisin âgé, volets fermés.", options: [
        { t: "Je frappe pour prendre des nouvelles", e: { coeur: 2 }, note: "Parfois, une visite change toute une semaine.", voit: ["voisin"] },
        { t: "Je passe mon chemin", e: { coeur: -1 }, note: "Les volets sont restés fermés." },
        { t: "Je demande à mes parents d'y aller avec moi", e: { coeur: 2 }, note: "Une visite en famille, encore mieux.", voit: ["voisin"] },
      ] },
      { q: "Tu emportes quoi pour la balade ?", options: [
        { t: "Une bouteille d'eau et une casquette", e: { prudent: 2 }, note: "Le soleil ne fait pas de cadeau.", voit: ["soleil"] },
        { t: "Rien, c'est juste à côté", e: { soleil: 1 }, note: "« Juste à côté » sous 35 °C, c'est loin." },
        { t: "Un ballon", e: { sport: 1, fun: 1 }, note: "Partout où il y a un ballon, il y a des amis." },
      ] },
      { q: "Le soir, que fais-tu ?", options: [
        { t: "Je prépare mon sac pour lundi", e: { serieux: 1 }, note: "La semaine commence bien." },
        { t: "Je raconte ma journée en famille", e: { famille: 2 }, note: "Les rires du soir sont les meilleurs." },
        { t: "Je regarde des vidéos jusqu'à tard", e: { fatigue: 1 }, note: "Lundi arrive toujours trop tôt." },
      ] },
    ],
    fins: [
      { si: (s) => s.soleil >= 2 && s.prudent < 2, emoji: "🥵", lieu: "à l'ombre… avec une insolation", texte: "Mal de tête, joues rouges : le soleil a gagné le match. Tu passes la soirée au lit avec une serviette mouillée sur le front.", verset: "Psaumes 121:6" },
      { si: (s) => s.coeur >= 2 && s.famille >= 2, emoji: "💛", lieu: "dans le cœur d'un voisin", texte: "Ton voisin était malade et seul. Ta visite lui a fait tellement de bien qu'il raconte toute la soirée des histoires de sa jeunesse. Vous rentrez émerveillés.", verset: "Matthieu 25:36" },
      { si: (s) => s.coeur >= 2, emoji: "🍲", lieu: "chez le voisin, avec une soupe", texte: "Le voisin était malade. Ta famille lui apporte une soupe, et lui retrouve le sourire. Le dimanche le plus utile de l'année !", verset: "Jacques 1:27" },
      { si: (s) => s.serieux < 1 && s.fatigue >= 1, emoji: "😱", lieu: "lundi matin, devoir oublié", texte: "« Le devoir pour aujourd'hui ? » Tu l'avais complètement oublié. Le dimanche était beau… mais lundi est rude.", verset: "Proverbes 6:9" },
      { si: (s) => s.repos >= 2 && s.serieux >= 1, emoji: "😴", lieu: "au pays du vrai repos", texte: "Sieste, devoir fini, sac prêt : tu commences la semaine en pleine forme.", verset: "Exode 20:10" },
      { si: () => true, emoji: "🌤️", lieu: "au soir d'un beau dimanche", texte: "Une belle journée simple, sous le soleil. Parfois, c'est tout ce qu'il faut.", verset: "Psaumes 118:24" },
    ],
  },
];

/** Totaux des traits après les choix ([index d'option par question]). */
export function traits(depart, choix) {
  const s = new Proxy({}, { get: (t, k) => (k in t ? t[k] : 0) });
  depart.questions.forEach((q, i) => {
    const o = q.options[choix[i]];
    for (const [k, v] of Object.entries(o?.e || {})) s[k] += v;
  });
  return s;
}

/** Fin atteinte (index dans depart.fins). */
export function finAtteinte(depart, choix) {
  const s = traits(depart, choix);
  const i = depart.fins.findIndex((f) => f.si(s));
  return i >= 0 ? i : depart.fins.length - 1;
}

/** Facteurs qu'aucun choix n'a pris en compte : [texte]. */
export function oublis(depart, choix) {
  const vus = new Set(depart.questions.flatMap((q, i) => q.options[choix[i]]?.voit || []));
  return Object.entries(depart.facteurs).filter(([k]) => !vus.has(k)).map(([, t]) => t);
}
