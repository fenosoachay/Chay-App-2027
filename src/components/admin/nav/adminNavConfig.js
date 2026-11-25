import {
  LayoutDashboard, BookOpen, Users, Gamepad2, Heart, Shield, Hash,
  Search, Sun, Headphones, Music, Video, Youtube, Image as ImageIcon,
  Megaphone, FileText, Mail, Brain, HeartHandshake, HelpCircle, UserPlus,
  Send, Library, Newspaper, Shuffle, MessageSquareQuote,
  Smile, Puzzle, Blocks, Landmark, UserSquare, LayoutGrid, Globe, Smartphone, Compass, Rocket,
  Type, Palette, Baby, Crown, Wrench, BarChart3, PanelBottom, Copyright, Heading,
  Layers, Home, Menu as MenuIcon, Sparkles, Link2, Lightbulb, HandHeart, Target, Flag, ScrollText,
  Images, Film, PanelsTopLeft, Phone,
} from "lucide-react";

// Hiérarchie de la navigation admin : 3 grandes parties (Application, Site chay.fr, Équipe), chacune avec ses
// rubriques et sous-rubriques. Une entrée avec `items` est un groupe (dépliable) ; une entrée avec `key` est une
// page (`key` = identifiant de la page affichée, `path` = route).
// Règle pour la suite : toute nouvelle page se range DANS la rubrique où elle apparaît dans l'app ou le site,
// à la même place (ex. 3e bloc de l'accueil -> 3e ligne de « Accueil »).
export const ADMIN_NAV = [
  {
    id: "app", label: "Application", icon: Smartphone,
    items: [
      { key: "overview", mots: "statistiques connectes carte", label: "Tableau de bord", icon: LayoutDashboard, path: "/admin" },
      {
        id: "app_contenu", label: "Contenu", icon: Layers,
        items: [
          {
            id: "app_accueil", label: "Accueil", icon: Home,
            items: [
              { key: "Devotional", mots: "verset du jour devotion meditation", label: "Verset du jour", icon: Sun, path: "/admin/devotionals" },
              { key: "Announcement", mots: "reunion annonce evenement", label: "Prochaine réunion", icon: Megaphone, path: "/admin/announcements" },
              { key: "requetes", mots: "requete priere sujet", label: "Requêtes", icon: HandHeart, path: "/admin/requetes" },
              { key: "question_logique", mots: "question logique enigme", label: "Question logique", icon: Lightbulb, path: "/admin/question-logique" },
              { key: "petite_histoire", mots: "petite histoire pop-up popup insolite", label: "Petite histoire", icon: Sparkles, path: "/admin/petite-histoire" },
              { key: "LienAccueil", mots: "liens site facebook youtube tiktok bas", label: "Liens des sites en bas", icon: Link2, path: "/admin/liens-accueil" },
            ],
          },
          {
            id: "app_media", label: "Multimédia", icon: Film,
            items: [
              { key: "MusicTrack", mots: "chant chanson louange", label: "Musique", icon: Music, path: "/admin/music" },
              { key: "TexteDefilant", mots: "texte defile defilant lecteur photo musique predication bible audio", label: "Texte qui défile", icon: Type, path: "/admin/texte-defilant" },
              { key: "Sermon", mots: "predication sermon message audio", label: "Prédication", icon: Headphones, path: "/admin/sermons" },
              { key: "Video", mots: "film drole tiktok court", label: "Vidéo", icon: Video, path: "/admin/videos" },
              { key: "YouTubeVideo", mots: "culte celebration", label: "YouTube", icon: Youtube, path: "/admin/youtube" },
              {
                id: "app_galerie", label: "Galerie", icon: Images,
                items: [
                  { key: "GalleryImage", mots: "photo image", label: "Photos", icon: ImageIcon, path: "/admin/gallery" },
                  { key: "Wallpaper", mots: "fond ecran wallpaper", label: "Fonds d'écran", icon: Smartphone, path: "/admin/fonds-ecran" },
                ],
              },
              { key: "Article", label: "Article", icon: FileText, path: "/admin/articles" },
              { key: "Paroles", mots: "chant lyrics", label: "Parole", icon: Type, path: "/admin/paroles" },
              {
                id: "app_verset", label: "Verset", icon: BookOpen,
                items: [
                  { key: "Verset", mots: "verset preche", label: "Versets", icon: BookOpen, path: "/admin/verset" },
                  { key: "bible_sync", mots: "verset passage bible", label: "Recherche Bible", icon: Search, path: "/admin/bible-search" },
                ],
              },
              { key: "Playlist", mots: "liste sous-playlist", label: "Playlists", icon: Library, path: "/admin/playlists" },
            ],
          },
          {
            id: "app_jeux", label: "Jeux", icon: Gamepad2,
            items: [
              {
                id: "chay_kids", label: "Chay Kids", icon: Baby,
                items: [
                  { key: "VideoEnfant", mots: "video film dessin anime enfant kids", label: "Vidéos", icon: Video, path: "/admin/videos-enfants" },
                  { key: "Coloriage", mots: "coloriage dessin enfant colorier", label: "Coloriages", icon: Palette, path: "/admin/coloriages" },
                  { key: "jeux_carte", mots: "memory carte paire enfant jeu", label: "Jeux Carte", icon: LayoutGrid, path: "/admin/jeux-carte" },
                  { key: "puzzles", mots: "puzzle image enfant", label: "Puzzles", icon: Puzzle, path: "/admin/puzzles" },
                ],
              },
              {
                id: "chay_game", label: "Chay Game", icon: Gamepad2,
                items: [
                  { key: "game_categories", label: "Catégories des jeux", icon: LayoutGrid, path: "/admin/jeux-categories" },
                  { key: "quiz", label: "Quiz biblique", icon: Brain, path: "/admin/quiz" },
                  { key: "wordscramble", label: "Mots mélangés", icon: Shuffle, path: "/admin/word-scramble" },
                  { key: "emojis", mots: "emoji devine", label: "Devine qui je suis", icon: Smile, path: "/admin/emojis" },
                  { key: "MotCroise", mots: "mots croises grille definition", label: "Mots croisés", icon: Hash, path: "/admin/mots-croises" },
                  { key: "blockblast", mots: "brique block", label: "Messages Brique", icon: Blocks, path: "/admin/block-blast" },
                ],
              },
            ],
          },
          {
            id: "app_menu", label: "Menu", icon: MenuIcon,
            items: [
              { key: "ChurchHistory", mots: "histoire eglise", label: "Histoire de l'église", icon: Landmark, path: "/admin/histoire" },
              { key: "PageTexte_vision", mots: "vision eglise", label: "Vision de l'église", icon: Target, path: "/admin/vision" },
              { key: "PageTexte_but", mots: "but eglise", label: "But de l'église", icon: Flag, path: "/admin/but" },
              { key: "PageTexte_confession", mots: "foi declaration confession", label: "Confession de foi", icon: ScrollText, path: "/admin/confession" },
              { key: "StaffMember", mots: "en service equipe staff personnel", label: "En service", icon: UserSquare, path: "/admin/personnel" },
              { key: "Faq", mots: "question reponse", label: "FAQ", icon: HelpCircle, path: "/admin/faq" },
            ],
          },
          {
            id: "app_communaute", label: "Communauté", icon: Users,
            items: [
              { key: "ContactMessage", mots: "contact formulaire site", label: "Message", icon: Mail, path: "/admin/messages" },
              { key: "donations", mots: "don argent", label: "Demande de don", icon: HeartHandshake, path: "/admin/donations" },
              { key: "theme_requests", mots: "theme", label: "Demande de thème", icon: MessageSquareQuote, path: "/admin/theme-requests" },
              { key: "mission_requests", mots: "mission", label: "Se missionner", icon: Compass, path: "/admin/missions" },
              { key: "signalements", mots: "probleme technique bug aide assistance signalement", label: "Problème technique", icon: Wrench, path: "/admin/signalements" },
              { key: "publish", mots: "publication", label: "Publier", icon: Send, path: "/admin/publish" },
              { key: "Content", label: "Contenus publiés", icon: Newspaper, path: "/admin/published" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "site", label: "Site chay.fr", icon: Globe,
    items: [
      { key: "site_visites", mots: "site visites statistiques frequentation", label: "Tableau de bord", icon: BarChart3, path: "/admin/site-visites" },
      {
        id: "site_contenu", label: "Contenu", icon: Layers,
        items: [
          {
            id: "site_accueil", label: "Accueil", icon: Home,
            items: [
              { key: "SiteBandeau", mots: "site texte defile bandeau tongasoa", label: "Texte qui défile", icon: FileText, path: "/admin/site-bandeau" },
              { key: "SiteBloc_accueil", mots: "site titre eglise chay fiangonana", label: "Haut de page et titres", icon: Heading, path: "/admin/site-titres" },
              { key: "SiteVerset", mots: "site verset accueil", label: "Versets", icon: BookOpen, path: "/admin/site-versets" },
              { key: "SiteCarrousel", mots: "site nouveaute carrousel photo", label: "Nouveauté (photos)", icon: ImageIcon, path: "/admin/site-nouveautes" },
              { key: "SiteCulte", mots: "site culte youtube lien", label: "Cultes YouTube", icon: Youtube, path: "/admin/site-cultes" },
              { key: "SiteBloc_pied", mots: "site bas de page reseaux facebook tiktok", label: "Bas de page", icon: PanelBottom, path: "/admin/site-bas-de-page" },
              { key: "SiteBloc_copyright", mots: "site copyright", label: "Copyright", icon: Copyright, path: "/admin/site-copyright" },
            ],
          },
          {
            id: "site_pages", label: "Pages", icon: PanelsTopLeft,
            items: [
              { key: "SiteBloc_foi", mots: "site declaration foi", label: "Déclaration de foi", icon: FileText, path: "/admin/site-foi" },
              { key: "SiteBloc_apropos", mots: "site propos histoire", label: "À propos", icon: FileText, path: "/admin/site-apropos" },
              {
                id: "site_application", label: "Application Chay", icon: Smartphone,
                items: [
                  { key: "SiteBloc_application", mots: "site application apk fonction", label: "Textes", icon: FileText, path: "/admin/site-application" },
                  { key: "SiteCapture", mots: "site application capture ecran defilement", label: "Captures d'écran", icon: Images, path: "/admin/site-application-captures" },
                ],
              },
              {
                id: "site_association", label: "Association Chay", icon: Heart,
                items: [
                  { key: "SiteBloc_association", mots: "site association don madagascar", label: "Textes", icon: FileText, path: "/admin/site-association" },
                  { key: "SiteAssoPhoto", mots: "site association photo", label: "Photos", icon: ImageIcon, path: "/admin/site-association-photos" },
                  { key: "SiteNumeroAsso", mots: "site association numero telephone whatsapp contacter", label: "Numéro WhatsApp", icon: Phone, path: "/admin/site-association-numero" },
                ],
              },
              { key: "SiteBloc_contact", mots: "site contact telephone whatsapp", label: "Nous contacter", icon: Mail, path: "/admin/site-contact" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "team", label: "Équipe", icon: Shield,
    items: [
      { key: "invite", label: "Inviter un admin", icon: UserPlus, path: "/admin/invite" },
      { key: "membres", mots: "membre vip niveau utilisateur", label: "Gérer les membres", icon: Crown, path: "/admin/membres" },
      { key: "admins", mots: "administrateur role", label: "Gérer les administrateurs", icon: Users, path: "/admin/admins" },
      { key: "app_update", mots: "version apk", label: "Annoncer une mise à jour", icon: Rocket, path: "/admin/mise-a-jour" },
    ],
  },
];

/** Toutes les pages, à plat, chacune avec la liste de ses groupes parents (du plus haut au plus proche). */
export function pagesNav(arbre = ADMIN_NAV, parents = []) {
  const out = [];
  for (const entry of arbre) {
    if (entry.items) out.push(...pagesNav(entry.items, [...parents, entry]));
    else out.push({ item: entry, parents });
  }
  return out;
}

const PAGES = pagesNav();

// Retrouve la page d'une clé, son groupe le plus proche (`group`) et tous ses groupes parents (`parents`).
export function findNav(key) {
  const p = PAGES.find((x) => x.item.key === key) || PAGES.find((x) => x.item.key === "overview");
  return { group: p.parents[p.parents.length - 1] || null, parents: p.parents, item: p.item };
}

export function findNavByPath(pathname) {
  const clean = pathname.replace(/\/$/, "") || "/admin";
  return PAGES.find((x) => x.item.path === clean)?.item.key || "overview";
}

/** Route d'une clé de page. */
export const PATH_BY_KEY = Object.fromEntries(PAGES.map(({ item }) => [item.key, item.path]));

// Recherche dans le menu admin (champ au-dessus du menu) : nom de la page, de ses rubriques et mots-clés
// (`mots`), sans tenir compte des accents ni des majuscules. Ex. « foi » -> Confession de foi.
const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function chercherNav(texte) {
  const mots = simplifier(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const resultats = [];
  for (const { item, parents } of PAGES) {
    const nom = simplifier(item.label);
    const groupes = parents.map((g) => g.label);
    // Chaque mot tapé doit être le début d'un mot du nom, d'une rubrique ou des mots-clés.
    const tout = `${nom} ${simplifier(groupes.join(" "))} ${simplifier(item.mots)}`.split(/[^a-z0-9]+/);
    if (!mots.every((m) => tout.some((w) => w.startsWith(m)))) continue;
    // Le nom qui commence par la recherche passe en premier, puis le nom qui la contient, puis le reste.
    const rang = nom.startsWith(mots[0]) ? 0 : nom.includes(mots[0]) ? 1 : 2;
    resultats.push({ item, groupe: groupes.length ? groupes.join(" › ") : null, rang });
  }
  return resultats.sort((a, b) => a.rang - b.rang);
}
