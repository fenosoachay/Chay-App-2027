import {
  BookOpen, Headphones, Film, Music, Library, FileText, Youtube,
  Image as ImageIcon, Bell, HelpCircle, Mail, Newspaper, Landmark, UserSquare, Globe, Smartphone, Type, Palette, Phone,
} from "lucide-react";
import { AUDIENCES } from "@/lib/audience";

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "mg", label: "Malagasy" },
];

// ── Site public chay.fr (Administration › Site chay.fr) ─────────────────────────────────────────────────────
// Lecture publique par le site ; collections créées par pocketbase/scripts/migrer-site-chay.mjs.
const ICONES_SITE = [
  ["musique", "Musique"], ["video", "Vidéo"], ["micro", "Micro"], ["radio", "Radio"], ["verset", "Verset"],
  ["message", "Message"], ["priere", "Prière (cœur)"], ["communaute", "Communauté"], ["bible", "Bible"],
  ["audio", "Casque audio"], ["galerie", "Photo"], ["fond", "Téléphone"], ["enfant", "Enfant"], ["jeu", "Manette"],
  ["maison", "Maison"], ["ecole", "École"], ["soin", "Soin"], ["plante", "Plante"], ["betail", "Bétail"], ["monde", "Monde"],
].map(([value, label]) => ({ value, label }));
const ICONES_RESEAUX = [
  ["facebook", "Facebook"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"], ["smartphone", "Smartphone (application)"],
].map(([value, label]) => ({ value, label }));
const AIDE_ETOILES = "Astuce : entourez un mot d'étoiles pour l'écrire en doré et en italique, ex. Revivez nos *cultes*.";
const choixTypes = (liste) => liste.map(([value, label]) => ({ value, label }));
const pageSite = (page, label, types, { reference, icone, icones, titre = "Titre", texte = "Texte", aide } = {}) => ({
  key: `SiteBloc_${page}`,
  entity: "SiteBloc",
  fixe: { page },
  label,
  icon: FileText,
  sort: "order",
  listColumns: ["type", "titre"],
  detailField: "texte",
  fields: [
    { name: "type", label: "Genre de bloc", type: "select", required: true, options: choixTypes(types) },
    { name: "titre", label: titre, type: "text" },
    { name: "texte", label: texte, type: "textarea", ...(aide ? { help: aide } : {}) },
    ...(reference ? [{ name: "reference", label: reference, type: "text" }] : []),
    ...(icone ? [{ name: "icone", label: "Icône", type: "select", options: icones || ICONES_SITE }] : []),
  ],
});

export const SECTIONS_SITE = [
  {
    key: "SiteBandeau",
    label: "Texte qui défile",
    icon: FileText,
    sort: "order",
    listColumns: ["texte"],
    fields: [{ name: "texte", label: "Texte (en haut de toutes les pages du site)", type: "text", required: true }],
  },
  {
    key: "SiteVerset",
    label: "Versets",
    icon: BookOpen,
    sort: "order",
    listColumns: ["reference"],
    detailField: "texte",
    fields: [
      { name: "texte", label: "Verset", type: "textarea", required: true },
      { name: "reference", label: "Référence (ex. Matthieu 6:33)", type: "text", required: true },
    ],
  },
  {
    key: "SiteCarrousel",
    label: "Nouveauté (photos)",
    icon: ImageIcon,
    sort: "order",
    listColumns: ["titre"],
    detailField: "sous_titre",
    thumbField: "image_url",
    fields: [
      { name: "image_url", label: "Photo (format 16:9, paysage)", type: "file", accept: "image/*", required: true },
      { name: "titre", label: "Titre", type: "text", required: true },
      { name: "sous_titre", label: "Petite ligne sous le titre (facultatif, ex. Lundi et mercredi · 8h30)", type: "text" },
    ],
  },
  {
    key: "SiteCulte",
    label: "Cultes YouTube",
    icon: Youtube,
    sort: "-date",
    listColumns: ["titre", "date"],
    fields: [
      { name: "youtube_url", label: "Lien YouTube du culte", type: "text", required: true, help: "Collez le lien de la vidéo (youtube.com/watch?v=…, youtu.be/…, youtube.com/live/…)." },
      { name: "titre", label: "Titre (laisser vide : repris de YouTube)", type: "text" },
      { name: "date", label: "Date du culte", type: "date" },
    ],
  },
  pageSite("foi", "Page Déclaration de foi", [["surtitre", "Petit texte au-dessus du titre"], ["intro", "Introduction"], ["article", "Article de foi"], ["citation", "Citation (fin de page)"]],
    { reference: "Références bibliques, séparées par des virgules (ex. Jean 14.6, Romains 3.23)" }),
  pageSite("apropos", "Page À propos", [["surtitre", "Petit texte au-dessus du titre"], ["intro", "Introduction"], ["chapitre", "Titre de chapitre"], ["paragraphe", "Paragraphe"], ["citation", "Citation"]],
    { reference: "Référence de la citation (ex. Osée 4:6)" }),
  pageSite("contact", "Page Nous contacter", [["surtitre", "Petit texte au-dessus du titre"], ["intro", "Introduction"], ["telephone", "Téléphone"], ["email", "E-mail"], ["whatsapp", "WhatsApp (numéro)"], ["entete", "Formulaire (1er : titre + phrase ; 2e : petite mention sous le bouton)"]]),
  pageSite("association", "Page Association Chay", [["surtitre", "Petit texte au-dessus du titre"], ["intro", "Introduction"], ["entete", "Titre de partie (1er : mission ; 2e : projet)"], ["paragraphe", "Paragraphe de la mission"], ["pilier", "Projet (carte)"], ["citation", "Citation"], ["don", "Texte des dons (Titre = texte du bouton)"], ["whatsapp", "Numéro WhatsApp de l'association"], ["legal", "Information légale"]],
    { reference: "Référence de la citation (ex. Actes 20:35)", icone: true, aide: AIDE_ETOILES }),
  {
    // Numéro du bouton « Contacter l'association » (1.3.26) : le bouton ouvre WhatsApp sur ce numéro, affiché dessous.
    key: "SiteNumeroAsso",
    entity: "SiteBloc",
    fixe: { page: "association", type: "whatsapp" },
    label: "Numéro WhatsApp de l'association",
    icon: Phone,
    sort: "order",
    listColumns: ["texte"],
    fields: [
      { name: "texte", label: "Numéro WhatsApp (ex. +33 7 49 92 94 33)", type: "text", required: true, help: "Le bouton « Contacter l'association » ouvre WhatsApp sur ce numéro. Gardez une seule fiche." },
    ],
  },
  {
    key: "SiteAssoPhoto",
    label: "Photos de l'association",
    icon: ImageIcon,
    sort: "order",
    listColumns: ["legende"],
    thumbField: "image_url",
    fields: [
      { name: "image_url", label: "Photo", type: "file", accept: "image/*", required: true },
      { name: "legende", label: "Légende (facultatif)", type: "text" },
    ],
  },
  {
    // Captures d'écran qui défilent sur la page Application Chay (1.3.26), en deux rangées de sens opposés.
    key: "SiteCapture",
    label: "Captures de l'application",
    icon: ImageIcon,
    sort: "order",
    listColumns: ["rangee", "legende"],
    thumbField: "image_url",
    fields: [
      { name: "image_url", label: "Capture d'écran (photo en hauteur)", type: "file", accept: "image/*", required: true },
      { name: "rangee", label: "Rangée", type: "select", required: true, options: [{ value: "haut", label: "Rangée du haut (défile vers la gauche)" }, { value: "bas", label: "Rangée du bas (défile vers la droite)" }] },
      { name: "legende", label: "Légende (facultatif)", type: "text" },
    ],
  },
  pageSite("application", "Page Application Chay", [["surtitre", "Petit texte au-dessus du titre"], ["intro", "Introduction"], ["entete", "Titre de partie (1er : fonctions ; 2e : installation)"], ["bouton", "Bouton de téléchargement (Titre = gros texte, Texte = petit texte, lien = APK)"], ["fonction", "Fonction de l'app"], ["etape", "Étape d'installation"]],
    { icone: true, reference: "Lien (bouton de téléchargement)", aide: AIDE_ETOILES }),
  pageSite("accueil", "Haut de page et titres", [["surtitre", "Petit texte au-dessus du grand titre"], ["titre", "Grand titre (ÉGLISE CHAY)"], ["entete", "Titre de partie (1er : Nouveauté ; 2e : Cultes)"]],
    { titre: "Petit titre (ex. Nouveauté) — pour les titres de partie", texte: "Texte", aide: AIDE_ETOILES }),
  pageSite("pied", "Bas de page", [["pied", "Texte du bas de page"], ["reseau", "Lien (réseau social ou application)"]],
    { titre: "Titre (ex. Église Chay) ou nom du réseau", texte: "Texte du bas de page, ou adresse du lien (https://…)", icone: true, icones: ICONES_RESEAUX }),
  pageSite("copyright", "Copyright", [["copyright", "Ligne de copyright"]], { texte: "Texte (ex. © Église Chay 2026)" }),
];

// Menu de l'Église : une fiche par page (Vision, But, Confession de foi).
const pageTexte = (cle, label) => ({
  key: `PageTexte_${cle}`,
  entity: "PageTexte",
  fixe: { cle },
  label,
  icon: FileText,
  sort: "-updated_date",
  listColumns: ["title"],
  fields: [
    { name: "title", label: "Titre", type: "text", required: true },
    { name: "body", label: "Texte", type: "rich-text", required: true },
    { name: "photos", label: "Photos", type: "images" },
  ],
});

// Accueil de l'app › liens ronds en bas (site, réseaux) : modifiables (1.3.25), collection LienAccueil.
export const ICONES_LIEN_ACCUEIL = [
  ["site", "Site web (globe)"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["tiktok", "TikTok"],
  ["instagram", "Instagram"], ["whatsapp", "WhatsApp"],
].map(([value, label]) => ({ value, label }));
const SECTION_LIENS_ACCUEIL = {
  key: "LienAccueil",
  label: "Liens des sites en bas",
  icon: Globe,
  sort: "order",
  listColumns: ["label", "url"],
  fields: [
    { name: "label", label: "Nom (ex. Facebook)", type: "text", required: true },
    { name: "url", label: "Adresse (https://…)", type: "text", required: true },
    { name: "icone", label: "Icône", type: "select", required: true, options: ICONES_LIEN_ACCUEIL },
  ],
};

export const SECTIONS = [
  {
    key: "Devotional",
    label: "Verset du jour",
    icon: BookOpen,
    sort: "-reading_date",
    listColumns: ["title", "reading_date"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "scripture_reference", label: "Référence", type: "text", required: true },
      { name: "verse_text", label: "Verset", type: "textarea" },
      { name: "content", label: "Contenu", type: "textarea", required: true },
      { name: "reading_date", label: "Date", type: "date", required: true },
      { name: "image_url", label: "Image", type: "file", accept: "image/*" },
      { name: "language", label: "Langue", type: "select", options: LANGS },
    ],
  },
  {
    key: "Sermon",
    label: "Prédication",
    icon: Headphones,
    sort: "-created_date",
    listColumns: ["title", "speaker"],
    playlistField: "cover_url",
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "audio_url", label: "Audio", type: "file", accept: "audio/*", required: true },
    ],
    showPlaylist: true,
  },
  {
    key: "Announcement",
    label: "Prochaine réunion",
    icon: Bell,
    sort: "-date",
    listColumns: ["title", "date"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Texte", type: "textarea", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "event_date", label: "Date de la réunion", type: "date" },
      { name: "event_time", label: "Heure de la réunion (réunion)", type: "time", help: "Obligatoire pour une réunion (type Événement) : affichée, puis archivage automatique." },
      {
        name: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "event", label: "Événement" },
          { value: "news", label: "Actualité" },
          { value: "reminder", label: "Rappel" },
        ],
      },
      { name: "language", label: "Langue", type: "select", options: LANGS },
    ],
  },
  {
    key: "MusicTrack",
    label: "Musique",
    icon: Music,
    sort: "-created_date",
    listColumns: ["title", "artist"],
    playlistField: "cover_url",
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "artist", label: "Artiste", type: "text" },
      { name: "audio_url", label: "Audio", type: "file", accept: "audio/*", required: true },
    ],
    showPlaylist: true,
  },
  {
    key: "Video",
    label: "Vidéos",
    icon: Film,
    sort: "-created_date",
    listColumns: ["title"],
    playlistField: "cover_url",
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "video_url", label: "Vidéo", type: "file", accept: "video/*", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "language", label: "Langue", type: "select", options: LANGS },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
      { name: "duration_seconds", label: "Durée (s)", type: "number" },
    ],
    showPlaylist: true,
  },
  {
    key: "Article",
    label: "Articles",
    icon: FileText,
    sort: "-created_date",
    listColumns: ["title"],
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      // « rich-text » : éditeur de texte riche (React Quill) au lieu du simple
      // textarea — le champ « body » reste un string HTML, même entité qu'avant.
      { name: "body", label: "Contenu", type: "rich-text", required: true },
      { name: "excerpt", label: "Extrait", type: "textarea" },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
      { name: "cover_cropped", label: "Couverture recadrée", type: "boolean" },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "author", label: "Auteur", type: "text" },
    ],
    // Rangé dans une sous-playlist (Articles > Playlist > Sous-playlist).
    showPlaylist: true,
    playlistField: "cover_url",
  },
  {
    key: "YouTubeVideo",
    label: "YouTube",
    icon: Youtube,
    sort: "-created_date",
    listColumns: ["title"],
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "youtube_id", label: "ID YouTube", type: "text", required: true },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "thumbnail_url", label: "Miniature", type: "file", accept: "image/*" },
    ],
    showPlaylist: true,
    playlistField: "thumbnail_url",
  },
  {
    key: "GalleryImage",
    label: "Galerie",
    icon: ImageIcon,
    sort: "-created_date",
    listColumns: ["title"],
    // Vignette carrée (recadrée automatiquement) à gauche de chaque ligne.
    thumbField: "image_url",
    fields: [
      { name: "audience", label: "C'est pour", type: "select", required: true, options: AUDIENCES },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "image_url", label: "Image", type: "file", required: true, accept: "image/*" },
    ],
    showPlaylist: true,
    playlistField: "image_url",
  },
  {
    // Multimédia › « Fond d'écran » : photos de 200 Mo au plus ; vignette (thumb_url) créée à l'envoi.
    key: "Wallpaper",
    label: "Fonds d'écran",
    icon: Smartphone,
    sort: "order",
    listColumns: ["title"],
    thumbField: "thumb_url",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "image_url", label: "Photo (200 Mo max)", type: "file", accept: "image/*", required: true, apercu: "thumb_url" },
    ],
  },
  {
    // Enfants › « Coloriage » : dessins en noir et blanc (traits noirs sur fond blanc) que les enfants colorient.
    key: "Coloriage",
    label: "Coloriages",
    icon: Palette,
    sort: "order",
    listColumns: ["title"],
    thumbField: "thumb_url",
    fields: [
      { name: "title", label: "Titre (ex. Jésus marche sur l'eau)", type: "text", required: true },
      { name: "image_url", label: "Dessin en noir et blanc (traits noirs sur fond blanc)", type: "file", accept: "image/*", required: true, apercu: "thumb_url" },
    ],
  },
  {
    // Multimédia › « Actualité chrétienne » : visible des membres dès maintenant, même vide.
    key: "ChristianNews",
    label: "Actualité chrétienne",
    icon: Globe,
    sort: "order",
    listColumns: ["title"],
    thumbField: "cover_url",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "summary", label: "Résumé", type: "textarea" },
      { name: "body", label: "Texte", type: "rich-text" },
      { name: "cover_url", label: "Image", type: "file", accept: "image/*" },
      { name: "link_url", label: "Lien vers la source (https://…)", type: "text" },
    ],
  },
  {
    // Menu ☰ > « Histoire de l'église » : la page affiche la fiche la plus récente.
    key: "ChurchHistory",
    label: "Histoire de l'église",
    icon: Landmark,
    sort: "-updated_date",
    listColumns: ["title"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Texte", type: "rich-text", required: true },
      { name: "photos", label: "Photos", type: "images" },
    ],
  },
  {
    // Menu ☰ > « Personnel » : liste dans l'ordre choisi (cadenas puis glisser, champ `order`).
    key: "StaffMember",
    label: "Personnel",
    icon: UserSquare,
    sort: "order",
    listColumns: ["name", "role"],
    thumbField: "photo_url",
    fields: [
      { name: "name", label: "Nom", type: "text", required: true },
      { name: "role", label: "Rôle", type: "text", required: true },
      { name: "photo_url", label: "Photo", type: "file", accept: "image/*" },
    ],
  },
  {
    key: "Faq",
    label: "FAQ",
    icon: HelpCircle,
    sort: "order",
    listColumns: ["question"],
    fields: [
      { name: "question", label: "Question", type: "text", required: true },
      { name: "answer", label: "Réponse", type: "textarea", required: true },
      { name: "order", label: "Ordre", type: "number" },
    ],
  },
  // ── Nouvelles sections 1.3.11 ──────────────────────────────────────────────
  {
    // Multimédia › « Parole » : paroles de chansons ; la plus récente en haut (1.3.25).
    key: "Paroles",
    label: "Parole",
    icon: Type,
    sort: "-created_date",
    listColumns: ["title"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Texte", type: "rich-text", required: true },
      // Facultatif : petit bouton lecture/pause en haut à droite de la parole (1.3.25).
      { name: "musique_id", label: "Musique liée (facultatif)", type: "musique" },
    ],
  },
  {
    // Multimédia › « Verset » : versets prêchés, identique à Paroles + champ référence
    key: "Verset",
    label: "Versets",
    icon: BookOpen,
    sort: "-date",
    listColumns: ["title", "date", "reference"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Texte", type: "rich-text", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "reference", label: "Référence (ex. Jean 3:16)", type: "text" },
    ],
  },
  // Menu ☰ de l'Église › « Vision de l'Église », « But de l'Église », « Confession de foi » : une page d'admin
  // chacune (même collection PageTexte, champ `cle` imposé).
  pageTexte("vision", "Vision de l'église"),
  pageTexte("but", "But de l'église"),
  pageTexte("confession", "Confession de foi"),
  {
    key: "ContactMessage",
    label: "Message",
    icon: Mail,
    sort: "-created_date",
    listColumns: ["name", "subject", "source"],
    detailField: "message",
    readOnly: true,
    fields: [],
  },
  {
    key: "Content",
    label: "Contenus publiés",
    icon: Newspaper,
    sort: "-published_at",
    listColumns: ["title", "type", "status"],
    fields: [
      {
        name: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "audio", label: "Audio" },
          { value: "video", label: "Vidéo" },
          { value: "predication", label: "Prédication" },
          { value: "enseignement", label: "Enseignement" },
          { value: "annonce", label: "Annonce" },
          { value: "evenement", label: "Événement" },
          { value: "actualite", label: "Actualité" },
          { value: "autre", label: "Autre" },
        ],
      },
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Catégorie", type: "text" },
      {
        name: "status",
        label: "Statut",
        type: "select",
        required: true,
        options: [
          { value: "draft", label: "Brouillon" },
          { value: "published", label: "Publié" },
          { value: "archived", label: "Archivé" },
        ],
      },
      { name: "published_at", label: "Date de publication", type: "date" },
      { name: "thumbnail_url", label: "Miniature", type: "file", accept: "image/*" },
      { name: "media_url", label: "Média", type: "file" },
      { name: "resource_id", label: "ID ressource liée", type: "text" },
    ],
  },
  {
    key: "Playlist",
    label: "Playlists",
    icon: Library,
    sort: "-created_date",
    listColumns: ["name", "category"],
    thumbField: "cover_url",
    fields: [
      { name: "name", label: "Nom", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Catégorie", type: "select", options: [{ value: "music", label: "Musique" }, { value: "sermons", label: "Prédications" }, { value: "films", label: "Films" }, { value: "youtube", label: "YouTube" }, { value: "articles", label: "Articles" }, { value: "gallery", label: "Galerie" }, { value: "other", label: "Autre" }] },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
    ],
    readOnly: false,
  },
  SECTION_LIENS_ACCUEIL,
  ...SECTIONS_SITE,
];
