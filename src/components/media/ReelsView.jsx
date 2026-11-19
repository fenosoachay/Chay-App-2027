import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Pause, Volume2, VolumeX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { subscribeMediaControl } from "@/lib/mediaControl";

// Multimédia › Reels : vidéos courtes en plein écran vertical, façon TikTok.
//  - on glisse vers le haut / le bas pour passer d'une vidéo à l'autre (défilement « aimanté ») ;
//  - seule la vidéo à l'écran joue, en boucle ; un toucher met en pause ou relance ;
//  - bouton son ; vidéo horizontale : affichée entière avec des bandes noires ;
//  - retour (bouton ou geste du téléphone) : ferme les Reels (la catégorie est une entrée d'historique).
export default function ReelsView({ onBack }) {
  const [reels, setReels] = useState(null);
  const [actif, setActif] = useState(0);
  const [muet, setMuet] = useState(false);
  const [enPause, setEnPause] = useState(false);
  const conteneurRef = useRef(null);
  const videosRef = useRef([]);

  useEffect(() => {
    let vivant = true;
    base44.entities.Reel.list("-created_date", 200)
      .then((rows) => {
        if (!vivant) return;
        const liste = (Array.isArray(rows) ? rows : []).filter((r) => r?.video_url);
        liste.sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999)
          || String(b.created_date || "").localeCompare(String(a.created_date || "")));
        setReels(liste);
      })
      .catch(() => vivant && setReels([]));
    return () => { vivant = false; };
  }, []);

  // Musique ou vidéo en cours ailleurs dans l'app : mise en pause à l'ouverture des Reels.
  useEffect(() => {
    let enCours = null;
    const desabonner = subscribeMediaControl((c) => { enCours = c; });
    desabonner();
    if (enCours?.isPlaying) enCours.toggle?.();
  }, []);

  // Vidéo à l'écran : celle qui occupe au moins 60 % de la hauteur.
  useEffect(() => {
    const racine = conteneurRef.current;
    if (!racine || !reels?.length || !window.IntersectionObserver) return undefined;
    const obs = new window.IntersectionObserver(
      (entrees) => {
        entrees.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActif(Number(e.target.dataset.index));
        });
      },
      { root: racine, threshold: [0.6] }
    );
    racine.querySelectorAll("[data-reel]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reels]);

  // Lecture : seule la vidéo active joue ; les autres sont arrêtées et remises au début.
  useEffect(() => {
    videosRef.current.forEach((v, i) => {
      if (!v) return;
      if (i === actif) {
        v.muted = muet;
        if (!enPause) {
          v.play().catch(() => {
            // Navigateur qui refuse le son sans geste : on relance en muet (le bouton son permet de le remettre).
            v.muted = true;
            setMuet(true);
            v.play().catch(() => {});
          });
        }
      } else {
        v.pause();
        try { v.currentTime = 0; } catch { /* vidéo pas encore chargée */ }
      }
    });
  }, [actif, reels, muet, enPause]);

  useEffect(() => { setEnPause(false); }, [actif]);

  const basculerPause = useCallback(() => {
    const v = videosRef.current[actif];
    if (!v) return;
    if (v.paused) { setEnPause(false); v.play().catch(() => {}); }
    else { setEnPause(true); v.pause(); }
  }, [actif]);

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white">
      <button
        type="button"
        onClick={() => onBack?.()}
        aria-label="Fermer les Reels"
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-[max(1.25rem,env(safe-area-inset-top))] z-20 -translate-x-1/2 font-display text-lg font-extrabold">
        Reels
      </span>
      {reels?.length > 0 && (
        <button
          type="button"
          onClick={() => setMuet((m) => !m)}
          aria-label={muet ? "Activer le son" : "Couper le son"}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur"
        >
          {muet ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      )}

      {reels === null && (
        <div className="grid h-full place-items-center"><Loader2 className="h-10 w-10 animate-spin" /></div>
      )}
      {reels?.length === 0 && (
        <div className="grid h-full place-items-center px-8 text-center text-white/70">
          Aucun Reel pour le moment.
        </div>
      )}

      {reels?.length > 0 && (
        <div
          ref={conteneurRef}
          className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {reels.map((r, i) => (
            <section
              key={r.id}
              data-reel
              data-index={i}
              className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden"
            >
              <video
                ref={(el) => { videosRef.current[i] = el; }}
                src={Math.abs(i - actif) <= 1 ? r.video_url : undefined}
                poster={r.cover_url || undefined}
                loop
                playsInline
                preload={i === actif ? "auto" : "metadata"}
                controlsList="nodownload"
                disablePictureInPicture
                onClick={basculerPause}
                className="h-full w-full bg-black object-contain"
              />
              {i === actif && enPause && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid h-20 w-20 place-items-center rounded-full bg-black/45">
                    <Pause className="h-10 w-10" />
                  </span>
                </div>
              )}
              {(r.title || r.description) && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16">
                  {r.title && <p className="font-display text-base font-bold leading-snug">{r.title}</p>}
                  {r.description && <p className="mt-1 line-clamp-3 text-sm text-white/80">{r.description}</p>}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
