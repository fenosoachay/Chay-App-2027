import {
  LayoutDashboard, BookOpen, Film, Users, Gamepad2, Heart, Shield,
  Search, Sun, Headphones, Music, Video, Youtube, Image as ImageIcon,
  Megaphone, FileText, Mail, Brain, HeartHandshake, HelpCircle, UserPlus,
  Send, Library, Newspaper, Shuffle, MessageSquareQuote,
  Smile, Puzzle, Blocks, Landmark, UserSquare, LayoutGrid, Globe, Smartphone, Compass, Rocket,
  Type, Palette, Baby, Crown,
} from "lucide-react";

// Hiérarchie de la navigation admin. `key` = identifiant de la page affichée,
// `path` = route associée.
export const ADMIN_NAV = [
  { key: "overview", label: "Tableau de bord", icon: LayoutDashboard, path: "/admin" },
  {
    id: "bible", label: "Bible", icon: BookOpen,
    items: [
      { key: "bible_sync", mots: "verset passage", label: "Recherche Bible", icon: Search, path: "/admin/bible-search" },
      { key: "Devotional", mots: "devotion meditation", label: "Dévotionnels", icon: Sun, path: "/admin/devotionals" },
    ],
  },
  {
    id: "media", label: "Multimédia", icon: Film,
    items: [
      { key: "Sermon", mots: "predication sermon message audio", label: "Prédications", icon: Headphones, path: "/admin/sermons" },
      { key: "MusicTrack", mots: "chant chanson louange", label: "Musique", icon: Music, path: "/admin/music" },
      { key: "Video", mots: "film drole tiktok court", label: "Vidéos", icon: Video, path: "/admin/videos" },
      { key: "YouTubeVideo", mots: "culte celebration", label: "YouTube", icon: Youtube, path: "/admin/youtube" },
      { key: "GalleryImage", mots: "photo image", label: "Galerie", icon: ImageIcon, path: "/admin/gallery" },
      { key: "Playlist", mots: "liste sous-playlist", label: "Playlists", icon: Library, path: "/admin/playlists" },
      { key: "ChristianNews", mots: "news nouvelles", label: "Actualité chrétienne", icon: Globe, path: "/admin/actualite" },
      { key: "Wallpaper", mots: "fond ecran wallpaper", label: "Fonds d'écran", icon: Smartphone, path: "/admin/fonds-ecran" },
      { key: "Paroles", mots: "chant lyrics", label: "Paroles", icon: Type, path: "/admin/paroles" },
      { key: "Verset", label: "Verset", icon: BookOpen, path: "/admin/verset" },
    ],
  },
  {
    id: "community", label: "Communauté", icon: Users,
    items: [
      { key: "Announcement", mots: "annonce", label: "Annonces", icon: Megaphone, path: "/admin/announcements" },
      { key: "Article", label: "Articles", icon: FileText, path: "/admin/articles" },
      { key: "ContactMessage", mots: "contact", label: "Messages", icon: Mail, path: "/admin/messages" },
      { key: "publish", mots: "publication", label: "Publier", icon: Send, path: "/admin/publish" },
      { key: "Content", label: "Contenus publiés", icon: Newspaper, path: "/admin/published" },
    ],
  },
  {
    id: "games", label: "Jeux", icon: Gamepad2,
    items: [
      { key: "game_categories", label: "Catégories des jeux", icon: LayoutGrid, path: "/admin/jeux-categories" },
      { key: "quiz", label: "Quiz biblique", icon: Brain, path: "/admin/quiz" },
      { key: "wordscramble", label: "Mots mélangés", icon: Shuffle, path: "/admin/word-scramble" },
      { key: "emojis", mots: "emoji devine", label: "Devine qui je suis", icon: Smile, path: "/admin/emojis" },
      { key: "puzzles", label: "Gestion des puzzles", icon: Puzzle, path: "/admin/puzzles" },
      { key: "personalityquiz", mots: "personnalite", label: "Test de personnalité", icon: Heart, path: "/admin/personality-quiz" },
      { key: "blockblast", mots: "brique block", label: "Messages Brique", icon: Blocks, path: "/admin/block-blast" },
    ],
  },
  {
    id: "enfants", label: "Enfants", icon: Baby,
    items: [
      { key: "Coloriage", mots: "coloriage dessin enfant colorier", label: "Coloriages", icon: Palette, path: "/admin/coloriages" },
    ],
  },
  {
    id: "engagement", label: "Engagement", icon: Heart,
    items: [
      { key: "donations", mots: "don argent", label: "Demandes de don", icon: HeartHandshake, path: "/admin/donations" },
      { key: "theme_requests", mots: "theme", label: "Demandes de thème", icon: MessageSquareQuote, path: "/admin/theme-requests" },
      { key: "mission_requests", mots: "mission", label: "Se missionner", icon: Compass, path: "/admin/missions" },
      { key: "Faq", mots: "question reponse", label: "FAQ", icon: HelpCircle, path: "/admin/faq" },
      { key: "ChurchHistory", label: "Histoire de l'église", icon: Landmark, path: "/admin/histoire" },
      { key: "StaffMember", mots: "en service equipe staff", label: "Personnel", icon: UserSquare, path: "/admin/personnel" },
      { key: "PageTexte", mots: "foi declaration de foi confession vision but", label: "Vision, But, Confession", icon: FileText, path: "/admin/pages-eglise" },
    ],
  },
  {
    id: "team", label: "Équipe", icon: Shield,
    items: [
      { key: "invite", label: "Inviter un admin", icon: UserPlus, path: "/admin/invite" },
      { key: "membres", mots: "membre vip niveau tout le monde", label: "Gérer les membres", icon: Crown, path: "/admin/membres" },
      { key: "admins", mots: "administrateur role", label: "Gérer les administrateurs", icon: Users, path: "/admin/admins" },
      { key: "app_update", mots: "version apk", label: "Annoncer une mise à jour", icon: Rocket, path: "/admin/mise-a-jour" },
    ],
  },
];

// Retrouve la section parente et l'entrée correspondant à une clé de page.
export function findNav(key) {
  for (const entry of ADMIN_NAV) {
    if (entry.key === key) return { group: null, item: entry };
    const item = entry.items?.find((i) => i.key === key);
    if (item) return { group: entry, item };
  }
  return { group: null, item: ADMIN_NAV[0] };
}

export function findNavByPath(pathname) {
  const clean = pathname.replace(/\/$/, "") || "/admin";
  for (const entry of ADMIN_NAV) {
    if (entry.path === clean) return entry.key;
    const item = entry.items?.find((i) => i.path === clean);
    if (item) return item.key;
  }
  return "overview";
}

// Recherche dans le menu admin (champ au-dessus de « Tableau de bord ») : nom de la page, de sa section et
// mots-clés (`mots`), sans tenir compte des accents ni des majuscules. Ex. « foi » -> Vision, But, Confession.
const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function chercherNav(texte) {
  const mots = simplifier(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const resultats = [];
  for (const entry of ADMIN_NAV) {
    for (const item of entry.items || [entry]) {
      const nom = simplifier(item.label);
      // Chaque mot tapé doit être le début d'un mot du nom, de la section ou des mots-clés.
      const tout = `${nom} ${simplifier(entry.items ? entry.label : "")} ${simplifier(item.mots)}`.split(/[^a-z0-9]+/);
      if (!mots.every((m) => tout.some((w) => w.startsWith(m)))) continue;
      // Le nom qui commence par la recherche passe en premier, puis le nom qui la contient, puis le reste.
      const rang = nom.startsWith(mots[0]) ? 0 : nom.includes(mots[0]) ? 1 : 2;
      resultats.push({ item, groupe: entry.items ? entry.label : null, rang });
    }
  }
  return resultats.sort((a, b) => a.rang - b.rang);
}
