import React from "react";
import { Play } from "lucide-react";
import CompteurVues from "@/components/media/CompteurVues";
import BadgeAudience from "@/components/media/BadgeAudience";

function ytThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export default function YouTubeCard({ video, index = 0, playingIndex = -1, onPlay }) {
  const thumb = video.cover_url || video.thumbnail_url || ytThumb(video.youtube_id);
  const isPlaying = playingIndex === index;

  return (
    <>
      <button
        onClick={() => onPlay(index)}
        className={`group w-full text-left rounded-2xl border overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-all ${
          isPlaying ? "border-primary ring-2 ring-primary/30" : "border-border bg-card"
        }`}
      >
        <div className="relative aspect-video bg-black overflow-hidden">
          <img
            src={thumb}
            alt={video.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
          {isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-primary/90 text-white flex items-center justify-center">
                <Play className="h-5 w-5 ml-0.5 fill-current" />
              </div>
            </div>
          )}
          {!isPlaying && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid place-items-center h-12 w-12 rounded-full bg-primary/90 text-white shadow-lg group-hover:scale-110 transition">
                <Play className="h-5 w-5 ml-0.5 fill-currentColor" />
              </span>
            </span>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-bold text-sm line-clamp-2 leading-snug">{video.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <CompteurVues vue={{ type: "youtube", id: video.id }} base={video.view_count} />
            <BadgeAudience audience={video.audience} />
          </div>
          {video.verse_note && (
            <p className="mt-1.5 text-xs text-foreground/55 line-clamp-2 whitespace-pre-line">
              {video.verse_note}
            </p>
          )}
        </div>
      </button>
    </>
  );
}