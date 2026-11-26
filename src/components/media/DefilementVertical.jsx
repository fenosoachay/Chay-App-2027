import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, Eye, Heart, Pause, Volume2, VolumeX } from "lucide-react";
import { subscribeMediaControl } from "@/lib/mediaControl";
import { useBackHandler } from "@/hooks/useBackHandler";
import { compterVue, useCompteur } from "@/hooks/useCompteurVues";
import { useJaimes } from "@/hooks/useJaimes";
import Description from "@/components/media/Description";
import { infosConnues } from "@/lib/infosVideo";
import { IMAGE_ATTENTE } from "@/lib/attenteMedia";
import { REACTIONS, emojiDe } from "@/lib/reactions";

// Vidéos verticales façon TikTok, à partir de la vidéo touchée (`depart`) jusqu'à la dernière :
//  - chaque vidéo remplit tout l'écran (bords coupés si elle n'est pas exactement 9:16) ;
//  - on glisse vers le haut / le bas pour passer d'une vidéo à l'autre ; seule la vidéo à l'écran joue, en boucle ;
//  - un toucher met en pause ou relance ; barre de progression en bas (toucher = aller à cet endroit) ;
//  - colonne de droite : Réagir (👍 ❤️ 😂), Son, Vues ; titre et description en bas à gauche ;
//  - une vue est comptée à la moitié de la vidéo (comme les autres vidéos) ;
//  - retour (bouton ou geste du téléphone) : revient à la grille.
// items : [{ id, track_id, playlist_id, video_url, cover_url, title, description, listen_count }]

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".0", "")} M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(".0", "")} k` : String(n));

function Action({ label, valeur, onClick, children, actif = false }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={actif} className="flex flex-col items-center gap-1">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur">{children}</span>
      {valeur !== undefined && <span className="text-xs font-bold drop-shadow">{valeur}</span>}
    </button>
  );
}

function Vues({ item }) {
  const n = useCompteur({ type: "piste", id: item.track_id }, item.listen_count);
  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${n || 0} vues`}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/35 backdrop-blur"><Eye className="h-6 w-6" /></span>
      <span className="text-xs font-bold drop-shadow">{compact(Math.max(0, Math.floor(Number(n) || 0)))}</span>
    </div>
  );
}

export default function DefilementVertical({ items, depart = 0, titre, onClose }) {
  const [actif, setActif] = useState(depart);
  const [muet, setMuet] = useState(false);
  const [enPause, setEnPause] = useState(false);
  const [progression, setProgression] = useState(0); // 0 à 1, vidéo à l'écran
  // Règle (toutes les playlists) : une vidéo verticale remplit l'écran façon TikTok ; une vidéo horizontale
  // est affichée entière, avec des bandes noires en haut et en bas. On ne recadre QUE si la vidéo est
  // reconnue verticale : format inconnu (métadonnées pas encore lues, ou dimensions 0 sur certains Android)
  // -> affichée entière, jamais coupée.
  const [formats, setFormats] = useState(() => new Map()); // id -> "portrait" | "paysage"
  const estVerticale = (r) => {
    const f = formats.get(r.id);
    if (f) return f === "portrait";
    return infosConnues(r.video_url)?.portrait === true;
  };
  const mesurer = (r, v) => {
    if (!v || !(v.videoWidth > 0) || !(v.videoHeight > 0)) return;
    const f = v.videoHeight > v.videoWidth ? "portrait" : "paysage";
    setFormats((m) => (m.get(r.id) === f ? m : new Map(m).set(r.id, f)));
  };
  const conteneurRef = useRef(null);
  const videosRef = useRef([]);
  const vueComptee = useRef(false);
  const jaimes = useJaimes(items.map((v) => v.track_id).filter(Boolean));
  const [choixOuvert, setChoixOuvert] = useState(null); // track_id dont le choix 👍 ❤️ 😂 est ouvert

  useBackHandler(true, onClose);

  // Ouverture directement sur la vidéo touchée.
  useLayoutEffect(() => {
    const racine = conteneurRef.current;
    if (racine) racine.scrollTop = depart * racine.clientHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Musique ou vidéo en cours ailleurs dans l'app : mise en pause à l'ouverture.
  useEffect(() => {
    let enCours = null;
    const desabonner = subscribeMediaControl((c) => { enCours = c; });
    desabonner();
    if (enCours?.isPlaying) enCours.toggle?.();
  }, []);

  // Vidéo à l'écran : celle qui occupe au moins 60 % de la hauteur.
  useEffect(() => {
    const racine = conteneurRef.current;
    if (!racine || !items.length || !window.IntersectionObserver) return undefined;
    const obs = new window.IntersectionObserver(
      (entrees) => {
        entrees.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActif(Number(e.target.dataset.index));
        });
      },
      { root: racine, threshold: [0.6] }
    );
    racine.querySelectorAll("[data-video]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

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
  }, [actif, items, muet, enPause]);

  useEffect(() => { setEnPause(false); setProgression(0); vueComptee.current = false; setChoixOuvert(null); }, [actif]);

  const basculerPause = useCallback(() => {
    const v = videosRef.current[actif];
    if (!v) return;
    if (v.paused) { setEnPause(false); v.play().catch(() => {}); }
    else { setEnPause(true); v.pause(); }
  }, [actif]);

  // Toucher la barre : la vidéo saute à cet endroit.
  const allerA = (e) => {
    const v = videosRef.current[actif];
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    v.currentTime = ratio * v.duration;
    setProgression(ratio);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white">
      <button
        type="button"
        onClick={() => onClose?.()}
        aria-label="Retour"
        className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-20 grid h-11 w-11 place-items-center rounded-full bg-black/40 backdrop-blur"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      {titre && (
        <span className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+1.25rem)] z-20 max-w-[60%] -translate-x-1/2 truncate font-display text-lg font-extrabold drop-shadow">
          {titre}
        </span>
      )}

      <div
        ref={conteneurRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((r, i) => (
          <section
            key={r.id}
            data-video
            data-index={i}
            className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden bg-black"
          >
            <video
              ref={(el) => { videosRef.current[i] = el; }}
              src={Math.abs(i - actif) <= 1 ? r.video_url : undefined}
              poster={r.cover_url || IMAGE_ATTENTE}
              loop
              playsInline
              preload={i === actif ? "auto" : "metadata"}
              controlsList="nodownload"
              disablePictureInPicture
              onClick={basculerPause}
              onLoadedMetadata={(e) => mesurer(r, e.currentTarget)}
              onLoadedData={(e) => mesurer(r, e.currentTarget)}
              onResize={(e) => mesurer(r, e.currentTarget)}
              onPlaying={(e) => mesurer(r, e.currentTarget)}
              onTimeUpdate={(e) => {
                if (i !== actif) return;
                const v = e.currentTarget;
                if (!Number.isFinite(v.duration) || v.duration <= 0) return;
                setProgression(v.currentTime / v.duration);
                // Une vue à la moitié de la vidéo, une fois par passage sur cette vidéo.
                if (!vueComptee.current && v.currentTime / v.duration >= 0.5 && r.track_id) {
                  vueComptee.current = true;
                  compterVue({ type: "piste", id: r.track_id });
                }
              }}
              className={`h-full w-full ${estVerticale(r) ? "object-cover" : "object-contain"}`}
            />
            {i === actif && enPause && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid h-20 w-20 place-items-center rounded-full bg-black/45">
                  <Pause className="h-10 w-10" />
                </span>
              </div>
            )}

            {/* Colonne de droite, comme TikTok (sans bouton Partager, retiré à la demande). */}
            <div className="absolute right-3 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] z-10 flex flex-col items-center gap-5">
              <div className="relative">
                <Action
                  label={jaimes.maReaction(r.track_id) ? "Changer ou retirer ma réaction" : "Réagir"}
                  actif={Boolean(jaimes.maReaction(r.track_id))}
                  valeur={`${jaimes.resume(r.track_id).slice(0, 2).map((x) => x.emoji).join("")} ${compact(jaimes.compte(r.track_id))}`.trim()}
                  onClick={() => setChoixOuvert((c) => (c === r.track_id ? null : r.track_id))}
                >
                  {jaimes.maReaction(r.track_id)
                    ? <span className="text-[1.75rem] leading-none" aria-hidden="true">{emojiDe(jaimes.maReaction(r.track_id))}</span>
                    : <Heart className="h-7 w-7" />}
                </Action>
                {choixOuvert === r.track_id && (
                  <div role="group" aria-label="Choisir une réaction" className="absolute right-full top-0 mr-2 flex items-center gap-1 rounded-full bg-black/70 p-1.5 backdrop-blur animate-float-in">
                    {REACTIONS.map((x) => (
                      <button
                        key={x.value}
                        type="button"
                        aria-label={x.label}
                        aria-pressed={jaimes.maReaction(r.track_id) === x.value}
                        onClick={() => { jaimes.reagir(r.track_id, x.value); setChoixOuvert(null); }}
                        className={`grid h-12 w-12 place-items-center rounded-full text-[1.75rem] leading-none transition active:scale-90 ${jaimes.maReaction(r.track_id) === x.value ? "bg-white/25" : "hover:bg-white/15"}`}
                      >
                        {x.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Action label={muet ? "Activer le son" : "Couper le son"} onClick={() => setMuet((m) => !m)}>
                {muet ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
              </Action>
              <Vues item={r} />
            </div>

            {(r.title || r.description) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 max-h-[50%] overflow-y-auto bg-gradient-to-t from-black/85 to-transparent pl-4 pr-20 pb-[max(2rem,calc(env(safe-area-inset-bottom)+1.25rem))] pt-16">
                {r.title && <p className="font-display text-base font-bold leading-snug drop-shadow">{r.title}</p>}
                <div className="pointer-events-auto">
                  <Description texte={r.description} clair className="mt-1" />
                </div>
              </div>
            )}
            {i === actif && (
              <div
                role="slider"
                aria-label="Progression de la vidéo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progression * 100)}
                onClick={allerA}
                className="absolute inset-x-0 bottom-[env(safe-area-inset-bottom)] z-10 flex h-6 cursor-pointer items-end"
              >
                <div className="h-1 w-full bg-white/25">
                  <div className="h-full bg-white" style={{ width: `${progression * 100}%` }} />
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
