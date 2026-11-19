import React, { useMemo, useState } from "react";
import { Play } from "lucide-react";
import DefilementVertical from "@/components/media/DefilementVertical";

// Playlist « Drôle » (section Vidéo) : toutes les vidéos d'abord, en grille de vignettes verticales ;
// toucher une vidéo l'ouvre en plein écran façon TikTok, et on fait défiler jusqu'à la dernière.
// pistes : PlaylistTrack de la playlist (ordre de l'admin) ; descriptions : Map track_id -> description.
export default function VideosVerticales({ pistes, descriptions, titre }) {
  const [depart, setDepart] = useState(null);
  const items = useMemo(
    () => (pistes || [])
      .filter((t) => t.video_url)
      .map((t) => ({
        id: t.id,
        video_url: t.video_url,
        cover_url: t.cover_url,
        title: t.title,
        description: descriptions?.get(t.track_id) || "",
      })),
    [pistes, descriptions]
  );

  if (!items.length) {
    return <p className="text-foreground/50 text-sm">Aucune vidéo dans cette playlist pour le moment.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-5">
        {items.map((v, i) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setDepart(i)}
            aria-label={`Lire ${v.title || "la vidéo"}`}
            className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black"
          >
            {v.cover_url ? (
              <img src={v.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              // Sans image d'aperçu : première image de la vidéo.
              <video src={`${v.video_url}#t=0.1`} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left">
              <Play className="mb-0.5 h-3.5 w-3.5 text-white" fill="currentColor" aria-hidden="true" />
              {v.title && <span className="block truncate text-xs font-bold text-white">{v.title}</span>}
            </span>
          </button>
        ))}
      </div>
      {depart !== null && (
        <DefilementVertical items={items} depart={depart} titre={titre} onClose={() => setDepart(null)} />
      )}
    </>
  );
}
