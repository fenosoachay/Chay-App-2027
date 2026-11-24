import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import DefilementVertical from "@/components/media/DefilementVertical";
import BadgeAudience from "@/components/media/BadgeAudience";
import { lancerFilm } from "@/components/player/VideoPlayer";
import { formatDuree, infosConnues, infosVideo, useInfosVideo } from "@/lib/infosVideo";
import { formatVues } from "@/lib/vues";
import { useCompteur } from "@/hooks/useCompteurVues";
import { IMAGE_ATTENTE } from "@/lib/attenteMedia";

// Playlists « liste de films » de la section Vidéo (Film chrétien, À voir…) : affiches en grille,
// 3 par ligne sur téléphone, 6 sur ordinateur. Sous chaque affiche : titre, durée, vues.
// Toucher une affiche lance la vidéo à SON format : 16:9 -> lecteur film plein écran ; 9:16 -> plein écran
// vertical façon TikTok (avec les autres vidéos verticales de la playlist).
// pistes : PlaylistTrack de la playlist (ordre de l'admin) ; descriptions : Map track_id -> description ;
// cibleId : contenu visé par un lien partagé (track_id) -> mis en avant.

function Affiche({ v, cible, chargement, onOuvrir, refNoeud }) {
  const infos = useInfosVideo(v.video_url);
  const vues = useCompteur({ type: "piste", id: v.track_id }, v.listen_count);
  const duree = formatDuree(infos?.duree);
  const texteVues = formatVues(vues, "vue") || "0 vue";
  return (
    <button
      ref={refNoeud}
      type="button"
      onClick={onOuvrir}
      aria-label={`Lire ${v.title || "la vidéo"}`}
      data-track-id={v.track_id}
      className="group min-w-0 text-left focus-visible:outline-none"
    >
      <span
        className={`relative block aspect-[2/3] overflow-hidden rounded-xl bg-black ring-offset-2 ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-primary ${
          cible ? "ring-2 ring-primary" : ""
        }`}
      >
        {v.cover_url ? (
          <img src={v.cover_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          // Sans miniature : une image de la vidéo.
          <video src={`${v.video_url}#t=5`} poster={IMAGE_ATTENTE} preload="metadata" muted playsInline className="pointer-events-none h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
          <span className={`grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white transition ${chargement ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {chargement ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
          </span>
        </span>
      </span>
      <span className="mt-1.5 block truncate text-sm font-bold leading-tight">{v.title || "Sans titre"}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.7rem] text-foreground/55">
        {duree && <span>{duree}</span>}
        {duree && <span aria-hidden="true">•</span>}
        <span>{texteVues}</span>
        <BadgeAudience audience={v.audience} />
      </span>
    </button>
  );
}

export default function AffichesFilms({ pistes, descriptions, titre, cibleId }) {
  const [vertical, setVertical] = useState(null); // { items, depart }
  const [chargement, setChargement] = useState(null); // id de l'affiche en cours d'ouverture
  const noeuds = useRef(new Map());
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

  // Lien partagé : l'affiche visée est mise en avant et amenée à l'écran.
  useEffect(() => {
    if (!cibleId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      noeuds.current.get(cibleId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cibleId, items]);

  const ouvrir = async (i) => {
    const v = items[i];
    if (!v?.video_url || chargement) return;
    let infos = infosConnues(v.video_url);
    if (!infos) {
      setChargement(v.id);
      infos = await infosVideo(v.video_url);
      setChargement(null);
    }
    if (infos?.portrait) {
      // 9:16 : plein écran vertical, avec les autres vidéos verticales déjà reconnues.
      const verticales = items.filter((x) => x.id === v.id || infosConnues(x.video_url)?.portrait);
      setVertical({ items: verticales, depart: verticales.findIndex((x) => x.id === v.id) });
      return;
    }
    // 16:9 (ou format inconnu) : lecteur film, avec précédent / suivant parmi les films.
    const films = items.filter((x) => x.id === v.id || !infosConnues(x.video_url)?.portrait);
    lancerFilm({
      queue: films.map((x) => ({
        id: x.id,
        src: x.video_url,
        title: x.title,
        poster: x.cover_url,
        vue: { type: "piste", id: x.track_id }, // compteur de vues : +1 à la moitié (useCompteurVues)
      })),
      currentIndex: films.findIndex((x) => x.id === v.id),
    });
  };

  if (!items.length) {
    return <p className="text-foreground/50 text-sm">Aucune vidéo dans cette playlist pour le moment.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((v, i) => (
          <Affiche
            key={v.id}
            v={v}
            cible={cibleId === v.track_id}
            chargement={chargement === v.id}
            onOuvrir={() => ouvrir(i)}
            refNoeud={(n) => {
              if (n) noeuds.current.set(v.track_id, n);
              else noeuds.current.delete(v.track_id);
            }}
          />
        ))}
      </div>
      {vertical && (
        <DefilementVertical items={vertical.items} depart={vertical.depart} titre={titre} onClose={() => setVertical(null)} />
      )}
    </>
  );
}
