#!/usr/bin/env node
// Migration « site chay.fr » (refonte 2026) : contenus du site public gérés depuis l'app
// (Administration › Site chay.fr). Lecture publique (le site n'a pas de compte), écriture admins seulement.
//   SiteVerset    versets de l'Accueil (texte, référence), dans l'ordre choisi ;
//   SiteBandeau   textes qui défilent en haut de toutes les pages ;
//   SiteCarrousel photos 16:9 de « Nouveauté » (titre obligatoire, petite ligne facultative) ;
//   SiteCulte     cultes YouTube (lien collé ; titre repris de YouTube s'il est vide : hook site_chay.pb.js) ;
//   SiteAssoPhoto photos de la page Association Chay ;
//   SiteCapture   captures d'écran qui défilent sur la page Application Chay (rangée haut / bas, 1.3.26) ;
//   SiteBloc      textes des 5 pages du menu (un bloc = un paragraphe, un article, une citation…) ;
//   SiteEtat      état calculé par le serveur (cle « direct » : chaîne YouTube en direct ?) ;
//   ContactMessage : champ « source » (site / app) pour les messages du formulaire du site.
// Les textes actuels des pages et les 2 versets de départ sont ajoutés une seule fois (si la collection est vide).
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-site-chay.mjs              -> simulation
//   node pocketbase/scripts/migrer-site-chay.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

const PUBLIC = '';
const ADMINS = '@request.auth.role = "admin"';

const texte = (name, max, extra = {}) => ({
  name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra,
});
const nombre = (name) => ({ name, type: 'number', required: false, hidden: false, system: false });
const date = (name) => ({ name, type: 'date', required: false, hidden: false, system: false, min: '', max: '' });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });
const choix = (name, values, extra = {}) => ({ name, type: 'select', values, maxSelect: 1, required: false, hidden: false, system: false, ...extra });
// Champs communs aux collections gérées par l'app (adaptateur Base44 -> PocketBase : created_date, created_by…).
const communs = () => [
  nombre('order'),
  texte('created_by_id', 64),
  date('base44_created_date'),
  date('base44_updated_date'),
  texte('base44_created_by', 255),
  autodate('created', true, false),
  autodate('updated', true, true),
];
const collection = (name, champs, regles = {}) => ({
  name, type: 'base',
  listRule: PUBLIC, viewRule: PUBLIC, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
  ...regles,
  fields: [...champs, ...communs()],
  indexes: [`CREATE INDEX idx_${name.toLowerCase()}_order ON ${name} (\`order\`)`],
});

// accueil = haut de l'Accueil et titres de ses parties ; pied = bas de page (texte + réseaux) ; copyright = ligne ©.
export const PAGES = ['foi', 'apropos', 'contact', 'association', 'application', 'accueil', 'pied', 'copyright'];
export const TYPES_BLOC = [
  'surtitre', 'intro', 'article', 'chapitre', 'paragraphe', 'citation', 'pilier', 'don', 'legal', 'fonction', 'etape',
  'telephone', 'email', 'whatsapp',
  'titre', 'entete', 'pied', 'reseau', 'copyright', 'bouton',
];
export const RANGEES = ['haut', 'bas'];
export const ICONES = [
  'musique', 'video', 'micro', 'radio', 'verset', 'message', 'priere', 'communaute', 'bible', 'audio', 'galerie',
  'fond', 'enfant', 'jeu', 'maison', 'ecole', 'soin', 'plante', 'betail', 'monde',
  'facebook', 'youtube', 'tiktok', 'smartphone', 'instagram', 'whatsapp',
];

export function nouvellesCollections() {
  return [
    collection('SiteVerset', [texte('texte', 1000, { required: true }), texte('reference', 100, { required: true })]),
    collection('SiteBandeau', [texte('texte', 300, { required: true })]),
    collection('SiteCarrousel', [texte('image_url', 5000, { required: true }), texte('titre', 200, { required: true }), texte('sous_titre', 200)]),
    collection('SiteCulte', [texte('youtube_url', 300, { required: true }), texte('youtube_id', 20), texte('titre', 200), date('date')]),
    collection('SiteAssoPhoto', [texte('image_url', 5000, { required: true }), texte('legende', 200)]),
    collection('SiteCapture', [texte('image_url', 5000, { required: true }), choix('rangee', RANGEES, { required: true }), texte('legende', 200)]),
    collection('SiteBloc', [
      choix('page', PAGES, { required: true }), choix('type', TYPES_BLOC, { required: true }),
      texte('titre', 200), texte('texte', 8000), texte('reference', 300), choix('icone', ICONES),
    ]),
    // Écrit par le serveur seulement (tâche site_direct) : aucune écriture par l'API.
    collection('SiteEtat', [texte('cle', 50, { required: true }), texte('valeur', 2000)], { createRule: null, updateRule: null, deleteRule: null }),
    // Visites du site, une ligne par jour (écrite par le serveur : POST /api/chay/site/visite) ; lue par les admins.
    {
      ...collection('SiteVisite', [texte('jour', 10, { required: true }), nombre('visites')],
        { listRule: ADMINS, viewRule: ADMINS, createRule: null, updateRule: null, deleteRule: null }),
      indexes: ['CREATE UNIQUE INDEX idx_sitevisite_jour ON SiteVisite (jour)'],
    },
  ];
}

// ── Contenus de départ (textes de l'ancien site, remis en forme) ───────────────────────────────────────────────
const b = (page, type, titre, texte, reference = '', icone = '') => ({ page, type, titre, texte, reference, icone });
export const VERSETS_DEPART = [
  { texte: 'Cherchez premièrement le royaume et la justice de Dieu ; et toutes ces choses vous seront données par-dessus.', reference: 'Matthieu 6:33' },
  { texte: 'Vous connaîtrez la vérité, et la vérité vous affranchira.', reference: 'Jean 8:32' },
];
export const BANDEAU_DEPART = [
  { texte: "Tongasoa eto amin'ny Fiangonana Chay izay mitory ny Fanjakan'Andriamanitra." },
  { texte: "Bienvenue à l'Église Chay qui prêche le Royaume de Dieu." },
];
export const BLOCS_DEPART = [
  // Déclaration de foi
  b('foi', 'surtitre', '', 'Ce que nous croyons'),
  b('foi', 'intro', '', 'Six affirmations, toutes fondées sur la Parole de Dieu révélée dans la Bible.'),
  b('foi', 'article', 'Dieu créateur', 'Nous croyons que Dieu est le créateur de toutes les choses qui sont dans les cieux et sur la terre, les visibles et les invisibles, que toutes choses ont été créées par Lui et pour Lui.', 'Genèse 1.1, Romains 11.36'),
  b('foi', 'article', 'Jésus-Christ', "Nous croyons que Jésus-Christ est le Chemin, la Vérité et la Vie. Il est Dieu qui a pris une forme humaine, Il est la Parole qui s'est faite chair pour nous montrer le chemin. Il est mort pour chacun de nous à la croix et ressuscité au troisième jour. Nous croyons en un Dieu unique.", 'Jean 14.6, Jean 1.1, Jean 1.14, Jean 19.5, Matthieu 20.19, Éphésiens 4.5'),
  b('foi', 'article', 'La Bible', "Nous croyons que la Bible est la Parole unique inspirée de Dieu. Elle est la révélation de sa pensée et de sa volonté partagée à l'humanité.", '2 Pierre 1.20'),
  b('foi', 'article', 'Résurrection et rémission', 'Nous croyons à la résurrection des morts, à la rémission du péché par la repentance et aux miracles de Dieu.', 'Marc 12.25, Luc 24.47, Jean 14.11'),
  b('foi', 'article', "L'homme et l'Église", "Nous croyons que l'homme a été créé à l'image de Dieu mais, à cause de sa désobéissance, l'homme a chuté de la gloire de Dieu. Tout homme a péché excepté « Christ ». Nous croyons que Christ nous a rachetés de la malédiction. L'homme est le temple de Dieu et le Saint-Esprit agit en nous. L'Église, c'est nous : le corps du Christ.", 'Genèse 1.26, Romains 3.23, Galates 3.13, 1 Corinthiens 6.19'),
  b('foi', 'article', 'Le retour du Seigneur', 'Nous croyons que Dieu est le rémunérateur de ses ouvriers et que seul Christ est le médiateur entre les hommes et Dieu. Nous croyons en la prophétie biblique et au retour du Seigneur Jésus-Christ.', 'Hébreux 11.6, 1 Timothée 2.5, Apocalypse 22.13'),
  b('foi', 'citation', '', 'Jésus lui dit : Je suis le chemin, la vérité, et la vie. Nul ne vient au Père que par moi.', 'Jean 14:6'),
  // À propos
  b('apropos', 'surtitre', '', 'Notre histoire'),
  b('apropos', 'intro', '', "Le chemin d'une quête de vérité, de la tradition à la Parole de Dieu."),
  b('apropos', 'chapitre', 'La confiance des fidèles', ''),
  b('apropos', 'paragraphe', '', "Nous sommes nombreux à penser que parmi toutes les Églises existant sur terre, celle dans laquelle nous prions est la bonne. La confiance que nous mettons sur l'édifice « Église » et sur les personnes qui s'en rapportent de près ou de loin est telle que toutes les pratiques qui s'y font semblent être une évidence irréfutable."),
  b('apropos', 'paragraphe', '', "De ce fait, sous peine d'être traités de secte, les fidèles d'une Église quelconque n'osent pas s'écarter des enseignements octroyés par cette dernière."),
  b('apropos', 'paragraphe', '', "Les doctrines prodiguées sont ainsi reçues d'une génération à une autre. Par ailleurs, la relation intime qui existe entre Christ et un chrétien disparaît peu à peu, du fait que la soif de connaître Dieu en vérité disparaît au profit de l'envie d'écouter passivement un représentant de l'Église."),
  b('apropos', 'paragraphe', '', 'Pour ainsi dire, prier chaque dimanche finit par devenir une habitude, puisque nous ne ressentons plus le besoin de savoir si ce que nous faisons est réellement en accord avec la volonté de Dieu ou pas.'),
  b('apropos', 'chapitre', 'Le vide spirituel', ''),
  b('apropos', 'paragraphe', '', 'Pourtant, il est bon de savoir que chaque Église renferme son lot de mystère : un secret, une histoire, une doctrine propre à elle-même et qui nous est tout à fait inconnue, bien que nous y priions depuis fort longtemps.'),
  b('apropos', 'paragraphe', '', "Placé dans une Église catholique dès ma plus tendre enfance, j'ai été amené à suivre toutes les pratiques qui s'y faisaient et à avoir ainsi une confiance aveugle en celui que nous croyions détenir la Parole de Dieu, c'est-à-dire le Pape, qui, soit dit en passant, contredit lui-même les Saintes Écritures."),
  b('apropos', 'paragraphe', '', "Cependant, il arrive que la majorité des Églises ne soient pas en mesure de combler le vide spirituel qu'un chrétien peut ressentir. Cela pour la simple raison qu'au lieu d'avancer spirituellement, le chrétien stagne ou régresse au point de mourir spirituellement, à cause des fausses doctrines qui lui sont inculquées."),
  b('apropos', 'citation', '', "Mon peuple est détruit, parce qu'il lui manque la connaissance. Puisque tu as rejeté la connaissance, je te rejetterai, et tu seras dépouillé de mon sacerdoce ; puisque tu as oublié la loi de ton Dieu, j'oublierai aussi tes enfants.", 'Osée 4:6'),
  b('apropos', 'chapitre', 'La quête de vérité', ''),
  b('apropos', 'paragraphe', '', "Après avoir mûrement cherché la face de Dieu, j'ai compris que la majorité des Églises nous trompent depuis toujours à travers de fausses doctrines, non inspirées de la Bible mais de principes humains. La Parole de Dieu est détournée de son vrai sens d'origine au profit de divers cultes humains, comme les prières adressées à Marie, aux anges, aux morts, etc., promues par les Églises tant catholiques que protestantes évangéliques et autres."),
  b('apropos', 'citation', '', 'Vous annulez ainsi la parole de Dieu au profit de votre tradition.', 'Matthieu 15:6'),
  b('apropos', 'paragraphe', '', "Dans ma quête de vérité, je me suis tourné vers l'Église protestante luthérienne, avec l'espoir d'y trouver ce qui faisait défaut au sein de l'Église catholique romaine."),
  b('apropos', 'paragraphe', '', "À mon grand désarroi, j'ai découvert que l'Église en elle-même se basait sur les traditions ainsi que sur les cultures de nombreux pays. Ainsi, catholicisme, Église protestante luthérienne, Église réformée, évangélique, pentecôtiste et autres, toutes sans exception tolèrent en leur sein des doctrines contredisant la Bible."),
  b('apropos', 'chapitre', 'La naissance de Chay', ''),
  b('apropos', 'paragraphe', '', "Ayant découvert cette vérité, ma soif de connaissance s'accentua. J'entrepris donc des recherches sur les dogmes des Églises et sur la véracité de ces pratiques par rapport à la Bible."),
  // Nous contacter
  b('contact', 'surtitre', '', 'Écrivez-nous'),
  b('contact', 'intro', '', 'Une question, une prière, un témoignage ? Nous vous répondons avec joie.'),
  b('contact', 'telephone', 'Téléphone', '+33 7 49 77 06 74'),
  b('contact', 'telephone', 'Téléphone', '+33 7 49 92 94 33'),
  b('contact', 'email', 'E-mail', 'chay@chay.fr'),
  b('contact', 'whatsapp', 'WhatsApp', '+33 7 49 92 74 33'),
  // Association Chay
  b('association', 'surtitre', '', 'Madagascar · Solidarité'),
  b('association', 'intro', '', 'Nous avons tous reçu le cadeau de la vie, et derrière chaque vie se cache une richesse, une culture, un passé, un présent, mais surtout un avenir.'),
  b('association', 'paragraphe', 'Bâtir demain ensemble', "Nous bâtissons notre lendemain ensemble : c'est pourquoi Chay Association étend son horizon au-delà des frontières françaises et centralise son action à Madagascar."),
  b('association', 'paragraphe', '', "Chay Association accorde beaucoup d'importance à chaque personne. Tendre la main à notre prochain, c'est contribuer à un lendemain meilleur."),
  b('association', 'pilier', 'Orphelinat', "Un foyer pour accueillir les enfants dans le besoin, en sécurité et dans l'amour.", '', 'maison'),
  b('association', 'pilier', 'École', "L'éducation, essentielle au bon développement de chaque enfant.", '', 'ecole'),
  b('association', 'pilier', 'Dispensaire', 'Des soins de base accessibles aux habitants de la commune.', '', 'soin'),
  b('association', 'pilier', 'Agriculture', 'Du matériel et des semences pour cultiver et se nourrir.', '', 'plante'),
  b('association', 'pilier', 'Élevage', "Du bétail pour l'élevage et des revenus durables.", '', 'betail'),
  b('association', 'pilier', 'Commune autosuffisante', 'Le but : que chaque habitant puisse subvenir à ses besoins fondamentaux.', '', 'monde'),
  b('association', 'citation', '', "Il y a plus de bonheur à donner qu'à recevoir.", 'Actes 20:35'),
  b('association', 'don', '', "Vos dons et vos contributions sont les bienvenus. Pour soutenir l'Association Chay, écrivez-nous sur WhatsApp : nous vous expliquerons comment participer.", '+33 7 49 92 74 33'),
  b('association', 'legal', 'Publiée au Journal officiel le', '17/10/2020'),
  b('association', 'legal', 'SIREN', '923 180 426'),
  b('association', 'legal', 'SIRET (siège)', '923 180 426 00010'),
  // Application Chay
  b('application', 'surtitre', '', 'Gratuite · Android'),
  b('application', 'intro', '', "Toute la vie de l'Église Chay dans votre poche : la Parole, la louange, la prière et la communauté."),
  b('application', 'fonction', 'Musique', 'Chants et louanges, en playlists, même écran éteint.', '', 'musique'),
  b('application', 'fonction', 'Vidéos et films', 'Enseignements, films chrétiens et vidéos à faire défiler.', '', 'video'),
  b('application', 'fonction', 'Prédications', "Tous les messages de l'Église Chay, à écouter partout.", '', 'micro'),
  b('application', 'fonction', 'Webradio', "La radio Chay en direct, d'un seul geste.", '', 'radio'),
  b('application', 'fonction', 'Verset du jour', 'Une parole chaque matin, pour commencer la journée.', '', 'verset'),
  b('application', 'fonction', 'Messages', 'Échangez avec les membres et les responsables.', '', 'message'),
  b('application', 'fonction', 'Prière', "Partagez vos sujets de prière ; d'autres prient pour vous.", '', 'priere'),
  b('application', 'fonction', 'Communauté', "Les annonces, les réunions et la vie de l'église.", '', 'communaute'),
  b('application', 'fonction', 'Bible', 'Louis Segond 1910, concordance, dictionnaire et favoris.', '', 'bible'),
  b('application', 'fonction', 'Sagesse en audio', 'Les livres de sagesse de la Bible, à écouter.', '', 'audio'),
  b('application', 'fonction', 'Galerie', "Les photos de la vie de l'Église Chay.", '', 'galerie'),
  b('application', 'fonction', "Fonds d'écran", "Des versets en fond d'écran pour votre téléphone.", '', 'fond'),
  b('application', 'fonction', 'Espace enfants', 'Coloriages, jeux et histoires pour les plus petits.', '', 'enfant'),
  b('application', 'fonction', 'Jeux bibliques', 'Quiz bibliques et jeux de mémoire.', '', 'jeu'),
  b('application', 'etape', 'Télécharger', "Touchez « Android » depuis votre téléphone pour télécharger l'application."),
  b('application', 'etape', 'Installer', "Ouvrez le fichier reçu et autorisez l'installation si votre téléphone le demande."),
  b('application', 'etape', 'Créer son compte', 'Inscrivez-vous avec votre prénom, votre nom et votre e-mail. Bienvenue !'),
];

// Contenus ajoutés après la première version, par groupe. Un groupe n'est ajouté qu'une fois (marqueur dans SiteEtat,
// cle « graines_site ») : un bloc supprimé dans l'app ne revient jamais.
const APK = 'https://membres.chay.fr/telechargements/chay.apk';
export const GROUPES = {
  'accueil-titres': [
    b('accueil', 'surtitre', '', 'Fiangonana Chay'),
    b('accueil', 'titre', '', 'ÉGLISE CHAY'),
    b('accueil', 'entete', 'Nouveauté', "Ce qui se *vit* à l'Église Chay"),
    b('accueil', 'entete', 'Cultes', 'Revivez nos *cultes*'),
  ],
  pied: [
    b('pied', 'pied', 'Église Chay', 'Recueil d’enseignement biblique et contrepoids aux vaines idéologies, « CHAY » ne milite ni pour une entité religieuse, ni pour une entité athée quelconque ; met à l’honneur la Parole de Dieu révélée dans la Bible par le Saint-Esprit ; met à la connaissance de tout un chacun le profond et mystérieux message de la Bible. Les vidéos de la chaîne sont mises à la disposition de tous ceux et celles qui ont soif de vérité, « Jésus-Christ ».'),
    b('pied', 'reseau', 'Facebook', 'https://www.facebook.com/www.chay.fr', '', 'facebook'),
    b('pied', 'reseau', 'YouTube', 'https://www.youtube.com/@EgliseChay.fr-tv', '', 'youtube'),
    b('pied', 'reseau', 'TikTok', 'https://www.tiktok.com/@anjahamintsoa', '', 'tiktok'),
    b('pied', 'reseau', "Télécharger l'application", APK, '', 'smartphone'),
  ],
  copyright: [b('copyright', 'copyright', '', '© Église Chay 2026')],
  'entetes-pages': [
    b('association', 'entete', 'Notre mission', 'Bâtir *demain* ensemble'),
    b('association', 'entete', 'Le projet', 'Une commune *autosuffisante*'),
    b('application', 'entete', "Dans l'application", "Tout ce qu'il faut pour *grandir*"),
    b('application', 'entete', 'Installation', 'Prêt en *trois* étapes'),
    b('application', 'bouton', 'Android', 'Télécharger pour', APK),
    b('contact', 'entete', 'Envoyer un message', "Votre message arrive directement aux responsables de l'Église Chay."),
    b('contact', 'entete', '', 'Vos coordonnées servent uniquement à vous répondre.'),
  ],
};
// Numéro de départ du bloc « Numéro WhatsApp de l'association » : celui du bloc « don » s'il en a un.
export function numeroDepart(reference) {
  const r = String(reference || '').trim();
  return /\d{6,}/.test(r.replace(/\D/g, '')) ? r : '+33 7 49 92 74 33';
}
export const TOUS_LES_BLOCS = [...BLOCS_DEPART, ...Object.values(GROUPES).flat()];

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const ecrire = async (methode, chemin, corps, quoi) => {
    const r = await fetch(`${url}${chemin}`, { method: methode, headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    return r.json().catch(() => ({}));
  };

  // 1. Collections
  const nouvelles = new Set();
  for (const def of nouvellesCollections()) {
    const r = await fetch(`${url}/api/collections/${def.name}`, { headers });
    if (r.ok) { log(`  = ${def.name} existe déjà`); continue; }
    if (r.status !== 404) throw new Error(`lecture de ${def.name} impossible (HTTP ${r.status})`);
    changements.push(def.name);
    nouvelles.add(def.name);
    log(`  - ${def.name} : nouvelle collection`);
    if (appliquer) await ecrire('POST', '/api/collections', def, def.name);
  }

  // 2. ContactMessage.source
  const rc = await fetch(`${url}/api/collections/ContactMessage`, { headers });
  if (!rc.ok) throw new Error(`lecture de ContactMessage impossible (HTTP ${rc.status})`);
  const cm = await rc.json();
  if ((cm.fields || []).some((f) => f.name === 'source')) log('  = ContactMessage : champ source déjà présent');
  else {
    changements.push('ContactMessage (source)');
    log('  - ContactMessage : champ source (site / app)');
    if (appliquer) await ecrire('PATCH', '/api/collections/ContactMessage', { fields: [...cm.fields, texte('source', 20)] }, 'ContactMessage');
  }

  // 2 bis. SiteBloc existant : nouvelles valeurs des listes (page, type, icône)
  if (!nouvelles.has('SiteBloc')) {
    const rb = await fetch(`${url}/api/collections/SiteBloc`, { headers });
    if (!rb.ok) throw new Error(`lecture de SiteBloc impossible (HTTP ${rb.status})`);
    const sb = await rb.json();
    const voulu = { page: PAGES, type: TYPES_BLOC, icone: ICONES };
    let manque = [];
    const champs = (sb.fields || []).map((f) => {
      if (!voulu[f.name] || f.type !== 'select') return f;
      const ajout = voulu[f.name].filter((v) => !(f.values || []).includes(v));
      if (!ajout.length) return f;
      manque = manque.concat(ajout.map((v) => `${f.name}:${v}`));
      return { ...f, values: [...(f.values || []), ...ajout] };
    });
    if (!manque.length) log('  = SiteBloc : listes à jour');
    else {
      changements.push(`SiteBloc (listes : ${manque.length} valeurs)`);
      log(`  - SiteBloc : nouvelles valeurs ${manque.join(', ')}`);
      if (appliquer) await ecrire('PATCH', '/api/collections/SiteBloc', { fields: champs }, 'SiteBloc (listes)');
    }
  }

  // 3. Contenus de départ (seulement dans une collection vide)
  const vide = async (nom) => {
    if (nouvelles.has(nom)) return true;
    const r = await fetch(`${url}/api/collections/${nom}/records?perPage=1`, { headers });
    if (!r.ok) throw new Error(`lecture de ${nom} impossible (HTTP ${r.status})`);
    return ((await r.json()).totalItems || 0) === 0;
  };
  const blocsVides = await vide('SiteBloc');
  const graines = [['SiteVerset', VERSETS_DEPART], ['SiteBandeau', BANDEAU_DEPART]];
  for (const [nom, lignes] of graines) {
    if (!(await vide(nom))) { log(`  = ${nom} : contenus déjà présents (rien ajouté)`); continue; }
    changements.push(`${nom} (${lignes.length} contenus de départ)`);
    log(`  - ${nom} : ${lignes.length} contenus de départ`);
    if (!appliquer) continue;
    for (let i = 0; i < lignes.length; i++) {
      await ecrire('POST', `/api/collections/${nom}/records`, { ...lignes[i], order: i }, `${nom} n°${i + 1}`);
    }
  }

  // 4. Textes des pages (SiteBloc) : tout dans une collection vide, sinon les groupes pas encore ajoutés.
  let marqueur = null;
  let faits = [];
  if (!nouvelles.has('SiteEtat')) {
    const r = await fetch(`${url}/api/collections/SiteEtat/records?perPage=1&filter=${encodeURIComponent('cle="graines_site"')}`, { headers });
    if (!r.ok) throw new Error(`lecture de SiteEtat impossible (HTTP ${r.status})`);
    marqueur = (await r.json()).items?.[0] || null;
    try { faits = JSON.parse(marqueur?.valeur || '[]'); } catch (_) { faits = []; }
  }
  const aAjouter = blocsVides ? [['départ', BLOCS_DEPART], ...Object.entries(GROUPES)] : Object.entries(GROUPES).filter(([g]) => !faits.includes(g));
  if (!aAjouter.length) log('  = SiteBloc : contenus déjà présents (rien ajouté)');
  let ordre = 0;
  if (aAjouter.length && !blocsVides) {
    const r = await fetch(`${url}/api/collections/SiteBloc/records?perPage=1&sort=-order`, { headers });
    if (!r.ok) throw new Error(`lecture de SiteBloc impossible (HTTP ${r.status})`);
    ordre = (Number((await r.json()).items?.[0]?.order) || 0) + 1;
  }
  for (const [g, lignes] of aAjouter) {
    changements.push(`SiteBloc ${g} (${lignes.length})`);
    log(`  - SiteBloc : ${g} (${lignes.length} contenus)`);
    if (!appliquer) continue;
    for (let i = 0; i < lignes.length; i++) {
      await ecrire('POST', '/api/collections/SiteBloc/records', { ...lignes[i], order: ordre++ }, `SiteBloc ${g} n°${i + 1}`);
    }
  }
  // 5. Numéro WhatsApp de l'association (1.3.26) : un bloc à part, modifiable dans l'app (Site › Pages › Association
  //    Chay › Numéro WhatsApp). Créé une seule fois, avec le numéro qui était rangé dans le bloc « don ».
  const NUMERO = 'association-numero';
  let numeroAjoute = false;
  if (!faits.includes(NUMERO)) {
    const filtre = encodeURIComponent('page="association" && (type="whatsapp" || type="don")');
    const r = await fetch(`${url}/api/collections/SiteBloc/records?perPage=50&filter=${filtre}`, { headers });
    if (!r.ok) throw new Error(`lecture de SiteBloc impossible (HTTP ${r.status})`);
    const items = ((await r.json()).items || []).filter((x) => x.page === 'association');
    const don = items.find((x) => x.type === 'don');
    const numero = numeroDepart(don?.reference);
    if (items.some((x) => x.type === 'whatsapp')) log("  = SiteBloc : numéro WhatsApp de l'association déjà présent");
    else {
      changements.push(`SiteBloc numéro de l'association (${numero})`);
      log(`  - SiteBloc : numéro WhatsApp de l'association (${numero}, à corriger dans l'app si besoin)`);
      if (appliquer) {
        await ecrire('POST', '/api/collections/SiteBloc/records',
          { ...b('association', 'whatsapp', 'WhatsApp', numero), order: (Number(don?.order) || 0) + 0.5 }, "numéro de l'association");
      }
    }
    numeroAjoute = true;
  }
  if ((aAjouter.length || numeroAjoute) && appliquer) {
    const valeur = JSON.stringify([...Object.keys(GROUPES), NUMERO]);
    if (marqueur) await ecrire('PATCH', `/api/collections/SiteEtat/records/${marqueur.id}`, { valeur }, 'marqueur des contenus');
    else await ecrire('POST', '/api/collections/SiteEtat/records', { cle: 'graines_site', valeur }, 'marqueur des contenus');
  }
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
