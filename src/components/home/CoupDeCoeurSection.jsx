import React, { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Pause, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { choisirCoupDeCoeur, minutes, onde, pisteDe, titreDuMois } from "@/lib/coupDeCoeur";

// 1.4.1 : accueil › « Coup de cœur de ce mois », avant l'Accès rapide (version A, compacte).
// Lecture dans la carte : grand bouton, onde qui se remplit (toucher l'onde = avancer), temps écoulé / total.
// Novembre 2026 : barres de l'onde fines (4 px au plus) et réparties sur toute la largeur, aussi sur tablette.
// La musique passe par le lecteur global : elle continue en arrière-plan et dans la notification de lecture.
// Bord animé : une ligne rose et une ligne bleue qui se courent après (CSS .chay-coeur-*, index.css).
// Choix, durée, « C'est pour » : Admin › Application › Accueil › Coup de cœur (AdminCoupDeCoeur.jsx).

// Novembre 2026 : animation calculée en pixels (périmètre réel du cadre) et lancée par l'API Web Animations :
// plus de pathLength ni d'animation CSS sur le SVG, mal pris en charge par certaines WebView (tablettes Samsung).
// Avec « Supprimer les animations » / économie d'énergie (prefers-reduced-motion), les lignes tournent plus lentement.
const TOUR_MS = 5000;

function perimetre(l, h, r) {
  const rr = Math.max(0, Math.min(r, l / 2, h / 2));
  return 2 * (l + h) - (8 - 2 * Math.PI) * rr;
}

function BordAnime() {
  const ref = useRef(null);
  const l1 = useRef(null);
  const l2 = useRef(null);
  const [taille, setTaille] = useState(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return undefined;
    const mesurer = () => setTaille((t) => (t && t.l === el.offsetWidth && t.h === el.offsetHeight ? t : { l: el.offsetWidth, h: el.offsetHeight }));
    mesurer();
    if (typeof window.ResizeObserver === "undefined") {
      window.addEventListener("resize", mesurer);
      return () => window.removeEventListener("resize", mesurer);
    }
    const obs = new window.ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const rect = taille && { x: 1.1, y: 1.1, width: Math.max(0, taille.l - 2.2), height: Math.max(0, taille.h - 2.2), rx: 23 };
  const p = rect ? perimetre(rect.width, rect.height, rect.rx) : 0;
  useEffect(() => {
    if (!p) return undefined;
    const lent = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duree = lent ? TOUR_MS * 2 : TOUR_MS;
    const anims = [[l1.current, 0], [l2.current, p / 2]].map(([el, depart]) => {
      if (!el) return null;
      el.style.strokeDasharray = `${(p * 0.16).toFixed(1)}px ${(p * 0.84).toFixed(1)}px`;
      el.style.strokeDashoffset = `${-depart}px`;
      if (typeof el.animate !== "function") return null;
      return el.animate([{ strokeDashoffset: `${-depart}px` }, { strokeDashoffset: `${-depart - p}px` }], { duration: duree, iterations: Infinity, easing: "linear" });
    });
    return () => anims.forEach((a) => a?.cancel());
  }, [p]);
  return (
    <svg ref={ref} aria-hidden="true" className="chay-coeur-bord" width={taille?.l || 0} height={taille?.h || 0}>
      {rect && (
        <>
          <rect {...rect} className="chay-coeur-fond" />
          <rect ref={l1} {...rect} className="chay-coeur-l1" />
          <rect ref={l2} {...rect} className="chay-coeur-l2" />
        </>
      )}
    </svg>
  );
}

export default function CoupDeCoeurSection({ refreshKey = 0 }) {
  const [coeur, setCoeur] = useState(null);
  const { currentTrack, isPlaying, currentTime, duration, play, toggle, seek } = useAudioPlayer();

  useEffect(() => {
    let vivant = true;
    base44.entities.CoupDeCoeur.filter({ actif: true }, "-debut", 20)
      .then((liste) => { if (vivant) setCoeur(choisirCoupDeCoeur(Array.isArray(liste) ? liste : [])); })
      .catch(() => { if (vivant) setCoeur(null); });
    return () => { vivant = false; };
  }, [refreshKey]);

  const piste = useMemo(() => (coeur ? pisteDe(coeur) : null), [coeur]);
  const barres = useMemo(() => onde(coeur?.id), [coeur?.id]);
  if (!coeur || !piste) return null;

  const actuel = currentTrack?.id === piste.id;
  const enLecture = actuel && isPlaying;
  const total = actuel && duration > 0 ? duration : 0;
  const progres = total ? Math.min(1, currentTime / total) : 0;

  const lancer = () => {
    if (actuel) toggle();
    else play(piste);
  };
  const avancer = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (actuel && total) seek(ratio * total);
    else if (!actuel) play(piste);
  };

  return (
    <section className="chay-coeur relative mt-6 overflow-hidden rounded-[1.5rem] p-4 text-white" aria-label={titreDuMois()}>
      <BordAnime />
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF52B4]/15 px-3 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide text-[#FF8FCB]">
        <Heart className="h-3.5 w-3.5" fill="currentColor" /> {titreDuMois()}
      </span>
      {/* Novembre 2026 : plus de pochette (supprimée définitivement) : le titre et l'artiste seuls. */}
      <div className="mt-3.5">
        <div className="min-w-0">
          <p className="font-display text-[1.1875rem] font-extrabold leading-tight line-clamp-2">{coeur.title}</p>
          {coeur.artist && <p className="mt-1 truncate text-[0.8125rem] text-white/65">{coeur.artist}</p>}
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-3">
        <button
          type="button"
          onClick={lancer}
          aria-label={enLecture ? "Mettre en pause" : `Écouter ${coeur.title}`}
          className="chay-coeur-jouer grid h-14 w-14 shrink-0 place-items-center rounded-full"
        >
          {enLecture ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={avancer}
            aria-label="Avancer dans le chant"
            className="flex h-[2.375rem] w-full items-center justify-between gap-[2.5px]"
          >
            {barres.map((h, i) => (
              <i
                key={i}
                className={`min-w-[2px] max-w-[4px] flex-1 rounded-[2px] ${i / barres.length < progres ? "chay-coeur-onde-lue" : "bg-white/20"}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </button>
          <div className="mt-1.5 flex justify-between text-[0.6875rem] font-semibold text-white/55">
            <span>{minutes(actuel ? currentTime : 0)}</span>
            <span>{total ? minutes(total) : ""}</span>
          </div>
        </div>
      </div>
      {coeur.mot && (
        <p className="mt-3 border-l-[3px] border-[#FF52B4] pl-2.5 text-[0.8125rem] italic text-white/75">« {coeur.mot} »</p>
      )}
    </section>
  );
}
