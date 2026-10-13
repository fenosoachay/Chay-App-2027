import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import EntityCrud from "@/components/admin/EntityCrud";
import DashboardHome from "@/components/admin/DashboardHome";
import PublishContent from "@/components/admin/PublishContent";
import BibleSyncPanel from "@/components/bible/BibleSyncPanel";
import DonationRequests from "@/components/admin/DonationRequests";
import VersetDuJourSection from "@/components/home/VersetDuJourSection";
import { useDonationAlerts } from "@/hooks/useDonationAlerts";
import {
  LayoutDashboard,
  BookOpen,
  Headphones,
  Film,
  Music,
  Library,
  FileText,
  Youtube,
  Image as ImageIcon,
  Bell,
  HelpCircle,
  Mail,
  UserPlus,
  Loader2,
  Send,
  Newspaper,
  Heart,
} from "lucide-react";
import { GALLERY_SECTIONS } from "@/lib/mediaConstants";

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "mg", label: "Malagasy" },
];

const SECTIONS = [
  {
    key: "Devotional",
    label: "Dévotionnels",
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
    label: "Prédications",
    icon: Headphones,
    sort: "-created_date",
    listColumns: ["title", "speaker"],
    playlistField: "cover_url",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "audio_url", label: "Audio", type: "file", accept: "audio/*", required: true },
      { name: "visibility", label: "Visibilité", type: "select", options: [{ value: "membre", label: "Membre" }, { value: "non-membre", label: "Non-membre" }], required: true },
    ],
    showPlaylist: true,
  },
  {
    key: "Announcement",
    label: "Annonces",
    icon: Bell,
    sort: "-date",
    listColumns: ["title", "date"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Texte", type: "textarea", required: true },
      { name: "date", label: "Date", type: "date", required: true },
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
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "artist", label: "Artiste", type: "text", required: true },
      { name: "audio_url", label: "Audio", type: "file", accept: "audio/*", required: true },
      { name: "visibility", label: "Visibilité", type: "select", options: [{ value: "membre", label: "Membre" }, { value: "non-membre", label: "Non-membre" }], required: true },
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
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "video_url", label: "Vidéo", type: "file", accept: "video/*", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "language", label: "Langue", type: "select", options: LANGS },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
      { name: "duration_seconds", label: "Durée (s)", type: "number" },
      { name: "visibility", label: "Visibilité", type: "select", options: [{ value: "membre", label: "Membre" }, { value: "non-membre", label: "Non-membre" }], required: true },
    ],
    showPlaylist: true,
  },
  {
    key: "Article",
    label: "Articles",
    icon: FileText,
    sort: "-created_date",
    listColumns: ["title", "category"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "body", label: "Contenu", type: "textarea", required: true },
      { name: "excerpt", label: "Extrait", type: "textarea" },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "author", label: "Auteur", type: "text" },
      { name: "visibility", label: "Visibilité", type: "select", options: [{ value: "membre", label: "Membre" }, { value: "non-membre", label: "Non-membre" }], required: true },
    ],
  },
  {
    key: "YouTubeVideo",
    label: "YouTube",
    icon: Youtube,
    sort: "-created_date",
    listColumns: ["title", "category"],
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "youtube_id", label: "ID YouTube", type: "text", required: true },
      { name: "category", label: "Catégorie", type: "text" },
      { name: "thumbnail_url", label: "Miniature", type: "file", accept: "image/*" },
    ],
  },
  {
    key: "GalleryImage",
    label: "Galerie",
    icon: ImageIcon,
    sort: "-created_date",
    listColumns: ["title", "category"],
    // Vignette carrée (recadrée automatiquement) à gauche de chaque ligne.
    thumbField: "image_url",
    fields: [
      { name: "title", label: "Titre", type: "text", required: true },
      { name: "image_url", label: "Image", type: "file", required: true, accept: "image/*" },
      {
        name: "category",
        label: "Section",
        type: "select",
        options: GALLERY_SECTIONS.map((s) => ({ value: s.id, label: s.label })),
      },
      { name: "visibility", label: "Visibilité", type: "select", options: [{ value: "membre", label: "Membre" }, { value: "non-membre", label: "Non-membre" }], required: true },
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
  {
    key: "ContactMessage",
    label: "Messages",
    icon: Mail,
    sort: "-created_date",
    listColumns: ["name", "subject"],
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
      { name: "category", label: "Catégorie", type: "select", options: [{ value: "music", label: "Musique" }, { value: "sermons", label: "Prédications" }, { value: "films", label: "Films" }, { value: "other", label: "Autre" }] },
      { name: "cover_url", label: "Couverture", type: "file", accept: "image/*" },
    ],
    readOnly: false,
  },
];

const NAV = [
  { key: "overview", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "publish", label: "Publier", icon: Send },
  { key: "donations", label: "Demandes de don", icon: Heart },
  { key: "bible_sync", label: "Recherche Bible", icon: BookOpen },
  ...SECTIONS.map((s) => ({ key: s.key, label: s.label, icon: s.icon })),
];

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [active, setActive] = useState("overview");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const { unread, refresh: refreshDonations } = useDonationAlerts(user?.role === "admin");

  if (!user) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-foreground/60">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const section = SECTIONS.find((s) => s.key === active);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), "admin");
      toast({
        title: "Invitation envoyée",
        description: `${inviteEmail.trim()} a été invité en tant qu'administrateur.`,
      });
      setInviteOpen(false);
      setInviteEmail("");
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="display-fluid">
            <span className="brand-gradient-text">Administration</span>
          </h1>
          <p className="mt-2 text-foreground/60">
            Gérez tout le contenu de l'application CHAY.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:scale-105 transition glow-primary"
        >
          <UserPlus className="h-4 w-4" /> Inviter un admin
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Desktop sidebar */}
        <aside className="hidden md:block sticky top-6 self-start">
          <nav className="rounded-[1.5rem] border border-border bg-card p-3 space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const isActive = active === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => setActive(n.key)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" /> {n.label}
                  {n.key === "donations" && unread > 0 && (
                    <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">{unread}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <div>
          {/* Mobile pills */}
          <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <button
                  key={n.key}
                  onClick={() => setActive(n.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition ${
                    active === n.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {n.label}
                  {n.key === "donations" && unread > 0 && (
                    <span className="rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">{unread}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Main content */}
          <main>
            {active === "overview" ? (
              <DashboardHome onNavigate={setActive} />
            ) : active === "donations" ? (
              <DonationRequests onChange={refreshDonations} />
            ) : active === "publish" ? (
              <PublishContent />
            ) : active === "bible_sync" ? (
              <BibleSyncPanel />
            ) : (
              <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                  {section && (() => {
                    const Icon = section.icon;
                    return <Icon className="h-5 w-5 text-primary" />;
                  })()}
                  <h2 className="font-display font-extrabold text-xl">
                    {section?.label}
                  </h2>
                </div>
                {section?.key === "Devotional" && <VersetDuJourSection adminOnly />}
                {section && section.key !== "Devotional" && (
                  <EntityCrud
                    key={section.key}
                    entity={section.key}
                    fields={section.fields}
                    listColumns={section.listColumns}
                    sort={section.sort}
                    readOnly={section.readOnly}
                    detailField={section.detailField}
                    thumbField={section.thumbField}
                    playlistField={section.playlistField}
                    showPlaylist={section.showPlaylist}
                  />
                )}
              </section>
            )}
          </main>
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un administrateur</DialogTitle>
            <DialogDescription>
              L'invité recevra un lien pour rejoindre l'équipe d'administration de
              CHAY.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="adresse@email.com"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={invite}
              disabled={inviting || !inviteEmail.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Envoyer l'invitation
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}