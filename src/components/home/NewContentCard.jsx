import React from "react";
import {
  Music,
  Film,
  BookOpen,
  GraduationCap,
  Megaphone,
  CalendarDays,
  Newspaper,
  FileText,
  ArrowRight,
} from "lucide-react";

const ICONS = {
  audio: Music,
  video: Film,
  youtube: Film,
  article: Newspaper,
  gallery: FileText,
  predication: BookOpen,
  enseignement: GraduationCap,
  annonce: Megaphone,
  evenement: CalendarDays,
  actualite: Newspaper,
  autre: FileText,
};

const LABELS = {
  audio: "Audio",
  video: "Vidéo",
  youtube: "Vidéo YouTube",
  article: "Article",
  gallery: "Photo",
  predication: "Prédication",
  enseignement: "Enseignement",
  annonce: "Annonce",
  evenement: "Événement",
  actualite: "Actualité",
  autre: "Contenu",
};

// Carte d'une nouveauté. Le bouton « Regardez maintenant » reste toujours dans
// l'application : il appelle onOpen (qui navigue vers /media) et n'ouvre jamais
// d'URL externe (pas de target="_blank", pas de window.open sur media_url).
export default function NewContentCard({ item, unread, onOpen }) {
  const Icon = ICONS[item.type] || FileText;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-full text-left rounded-2xl border border-border bg-card p-3 flex flex-col gap-3 hover:border-primary transition min-h-[64px] relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`${item.title}, ${LABELS[item.type] || "contenu"}${
        unread ? ", non lu" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`h-11 w-11 rounded-xl grid place-items-center shrink-0 ${
            unread ? "brand-gradient text-white" : "bg-foreground/10 text-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{item.title}</span>
            {unread && (
              <span className="inline-flex items-center gap-1 text-[0.625rem] font-bold uppercase tracking-wide text-primary shrink-0">
                <span className="h-2 w-2 rounded-full bg-primary" /> Nouveau
              </span>
            )}
          </span>
          <span className="block text-xs text-foreground/50">
            {LABELS[item.type] || "Contenu"}
          </span>
          {item.description && (
            <span className="block text-xs text-foreground/60 mt-1 line-clamp-2">
              {item.description}
            </span>
          )}
          <span className="block text-xs text-foreground/40 mt-1">
            {item.published_at
              ? new Date(item.published_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : ""}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="self-start inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:scale-105 transition"
      >
        Regardez maintenant <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}