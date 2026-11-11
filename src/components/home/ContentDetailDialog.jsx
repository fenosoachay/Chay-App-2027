import React from "react";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import FullImage from "@/components/ui/FullImage";
import VideoPlayer from "@/components/player/VideoPlayer";
import ReactMarkdown from "react-markdown";

const TYPE_LABELS = {
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

// Affiche le contenu d'une nouveauté dans l'application (jamais de lien externe).
export default function ContentDetailDialog({ item, open, onOpenChange }) {
  const { play } = useAudioPlayer();
  if (!item) return null;

  const isVideo = item.type === "video";
  const isAudio = item.type === "audio" || item.type === "predication";
  const label = TYPE_LABELS[item.type] || "Contenu";
  const date = item.published_at
    ? new Date(item.published_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Image entière, sans recadrage. */}
        <FullImage src={item.thumbnail_url} className="rounded-xl mb-4 bg-muted/40" />

        <DialogHeader>
          <DialogTitle className="text-2xl">{item.title}</DialogTitle>
          <DialogDescription>
            {label}
            {date ? ` · ${date}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isVideo && item.media_url && (
          <VideoPlayer src={item.media_url} title={item.title} className="w-full max-h-72 rounded-xl" />
        )}
        {isAudio && item.media_url && (
          <button
            type="button"
            onClick={() => play({
              id: item.id,
              title: item.title,
              speaker: label,
              mediaType: item.type === "predication" ? "sermons" : "audio",
              audio_url: item.media_url,
              cover_url: item.thumbnail_url,
            })}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Lire dans le mini-lecteur
          </button>
        )}

        {item.description && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 leading-relaxed selectable mt-2">
            <ReactMarkdown>{item.description || ""}</ReactMarkdown>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}