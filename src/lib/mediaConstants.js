import {
  Radio,
  Music,
  Headphones,
  Film,
  FileText,
  Youtube,
  Image as ImageIcon,
  ListMusic,
  Home,
  Lightbulb,
} from "lucide-react";

export const RADIO_URL =
  "https://listen.radioking.com/radio/187180/stream/229321";
export const RADIO_LOGO =
  "https://media.base44.com/images/public/6aa138d0e963d9e5f59d838c/c26279d55_logo.png";

export const OFFLINE_PATTERN =
  "https://media.base44.com/images/public/6aa138d0e963d9e5f59d838c/b2868313e_LogograyChaycasdeproblme.png";

export const CATEGORIES = [
  { id: "radio", label: "Radio", icon: Radio, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "music", label: "Musique", icon: Music, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  { id: "sermons", label: "Prédications", icon: Headphones, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  { id: "films", label: "Films", icon: Film, tone: "from-[#8A56E2] to-[#FF57B2]" },
  { id: "youtube", label: "YouTube", icon: Youtube, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "articles", label: "Articles", icon: FileText, tone: "from-[#FF4D2D] to-[#8A56E2]" },
  { id: "gallery", label: "Galerie", icon: ImageIcon, tone: "from-[#4A6CFE] to-[#2E6F40]" },
  { id: "playlist", label: "Votre Playlist", icon: ListMusic, tone: "from-[#8A56E2] to-[#4A6CFE]" },
];

export const YOUTUBE_SECTIONS = [
  { id: "culte", label: "Culte", icon: Youtube, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "louange", label: "Louange", icon: Youtube, tone: "from-[#8A56E2] to-[#4A6CFE]" },
  { id: "celebration", label: "Célébration", icon: Youtube, tone: "from-[#FFD700] to-[#FF4D2D]" },
];

// Sections de la Galerie. `id` = valeur enregistrée dans le champ `category`
// de l'entité GalleryImage (saisie via la liste déroulante de l'admin).
export const GALLERY_SECTIONS = [
  { id: "eglise", label: "Église", icon: Home, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  { id: "mindset", label: "Mindset", icon: Lightbulb, tone: "from-[#8A56E2] to-[#FF57B2]" },
];

// Compare une valeur saisie à la main (« Église », « EGLISE », « eglise »…)
// avec l'id d'une section, sans se faire piéger par les accents ni la casse.
export const normalizeSection = (value) =>
  (value || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();