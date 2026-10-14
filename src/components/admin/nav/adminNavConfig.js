import {
  LayoutDashboard, BookOpen, Film, Users, Gamepad2, Heart, Shield,
  Search, Sun, Headphones, Music, Video, Youtube, Image as ImageIcon,
  Megaphone, FileText, Mail, Brain, HeartHandshake, HelpCircle, UserPlus,
  Send, Library, Newspaper, Shuffle,
} from "lucide-react";

// Hiérarchie de la navigation admin. `key` = identifiant de la page affichée,
// `path` = route associée.
export const ADMIN_NAV = [
  { key: "overview", label: "Tableau de bord", icon: LayoutDashboard, path: "/admin" },
  {
    id: "bible", label: "Bible", icon: BookOpen,
    items: [
      { key: "bible_sync", label: "Recherche Bible", icon: Search, path: "/admin/bible-search" },
      { key: "Devotional", label: "Dévotionnels", icon: Sun, path: "/admin/devotionals" },
    ],
  },
  {
    id: "media", label: "Multimédia", icon: Film,
    items: [
      { key: "Sermon", label: "Prédications", icon: Headphones, path: "/admin/sermons" },
      { key: "MusicTrack", label: "Musique", icon: Music, path: "/admin/music" },
      { key: "Video", label: "Vidéos", icon: Video, path: "/admin/videos" },
      { key: "YouTubeVideo", label: "YouTube", icon: Youtube, path: "/admin/youtube" },
      { key: "GalleryImage", label: "Galerie", icon: ImageIcon, path: "/admin/gallery" },
      { key: "Playlist", label: "Playlists", icon: Library, path: "/admin/playlists" },
    ],
  },
  {
    id: "community", label: "Communauté", icon: Users,
    items: [
      { key: "Announcement", label: "Annonces", icon: Megaphone, path: "/admin/announcements" },
      { key: "Article", label: "Articles", icon: FileText, path: "/admin/articles" },
      { key: "ContactMessage", label: "Messages", icon: Mail, path: "/admin/messages" },
      { key: "publish", label: "Publier", icon: Send, path: "/admin/publish" },
      { key: "Content", label: "Contenus publiés", icon: Newspaper, path: "/admin/published" },
    ],
  },
  {
    id: "games", label: "Jeux", icon: Gamepad2,
    items: [
      { key: "quiz", label: "Quiz biblique", icon: Brain, path: "/admin/quiz" },
      { key: "wordscramble", label: "Mots mélangés", icon: Shuffle, path: "/admin/word-scramble" },
    ],
  },
  {
    id: "engagement", label: "Engagement", icon: Heart,
    items: [
      { key: "donations", label: "Demandes de don", icon: HeartHandshake, path: "/admin/donations" },
      { key: "Faq", label: "FAQ", icon: HelpCircle, path: "/admin/faq" },
    ],
  },
  {
    id: "team", label: "Équipe", icon: Shield,
    items: [
      { key: "invite", label: "Inviter un admin", icon: UserPlus, path: "/admin/invite" },
      { key: "admins", label: "Gérer les administrateurs", icon: Users, path: "/admin/admins" },
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