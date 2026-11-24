import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import DefilementVertical from "@/components/media/DefilementVertical";
import BadgeAudience from "@/components/media/BadgeAudience";
import { IMAGE_ATTENTE } from "@/lib/attenteMedia";

// Playlist « Drôle » (section Vidéo) : toutes les vidéos d'abord, en grille de vignettes verticales 9:16 ;
// toucher une vidéo l'ouvre en plein écran façon TikTok, et on fait défiler jusqu'à la dernière.
// pistes : PlaylistTrack de la playlist (ordre de l'admin) ; descriptions : Map track_id -> description ;
// cibleId : contenu visé par un lien partagé (track_id) -> ouvert directement en plein écran.
export default function VideosVerticales({ pistes, descriptions, titre, cibleId }) {
  const [depart, setDepart] = useState(null);
  const items = useMemo(
    () => (pistes || [])
      .filter((t) => t.video_url)
      .map((t) => ({
        id: t.id,
        track_id: t.track_id,
        playlist_id: t.playlist_id,
        video_url: t.video_url,
        cover_url: t.cover_url,
        title: t.title,
        listen_count: t.listen_count,
        audience: t.audience,
        description: descriptions?.get(t.track_id) || "",
      })),
    [pistes, descriptions]
  );

  // Lien partagé : ouverture directe sur la vidéo (une seule fois).
  const cibleOuverte = useRef(false);
  useEffect(() => {
    if (!cibleId || cibleOuverte.current) return;
    const i = items.findIndex((v) => v.track_id === cibleId);
    if (i >= 0) { cibleOuverte.current = true; setDepart(i); }
  }, [cibleId, items]);

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
              <video src={`${v.video_url}#t=0.1`} poster={IMAGE_ATTENTE} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left">
              <Play className="mb-0.5 h-3.5 w-3.5 text-white" fill="currentColor" aria-hidden="true" />
              {v.title && <span className="block truncate text-xs font-bold text-white">{v.title}</span>}
              <BadgeAudience audience={v.audience} className="mt-0.5" />
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
