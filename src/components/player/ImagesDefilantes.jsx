import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { besoinPlaylists } from "@/lib/texteDefilant";
import { dureeGroupe, groupesPour, tailleDansCase } from "@/lib/imagesDefilantes";

// Image qui défile (1.3.34) sur l'image du lecteur audio (Musique, Prédication, Bible en audio), réglée dans
// Admin › Multimédia › Lecteur audio › Image qui défile. Chaque groupe (un seul format) s'anime à son tour :
// défilement horizontal, fondu enchaîné ou défilement vertical. Fond noir en mode sombre, blanc en mode clair.
// Le texte qui défile passe par-dessus.

// 1.3.34 : gardé 10 s seulement : une modification faite dans l'Admin se voit à la prochaine ouverture du
// lecteur ou au titre suivant (avant : gardé jusqu'à la fermeture de l'app).
let cache = null; // Promise<{ rows, parents }>
let chargeLe = 0;
function chargerImages() {
  if (!cache || Date.now() - chargeLe > 10000) {
    chargeLe = Date.now();
    cache = (async () => {
      const rows = await base44.entities.ImageDefilante.list("order", 200).catch(() => []);
      const liste = Array.isArray(rows) ? rows : [];
      let parents = new Map();
      if (besoinPlaylists(liste)) {
        const pl = await base44.entities.Playlist.list("-created_date", 2000).catch(() => []);
        parents = new Map((Array.isArray(pl) ? pl : []).filter((p) => p.parent_id).map((p) => [p.id, p.parent_id]));
      }
      return { rows: liste, parents };
    })();
  }
  return cache;
}

/** Côté de la case carrée, suivi sans lecture de mise en page à chaque image. */
function useCote(ref, actif) {
  const [cote, setCote] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setCote(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(([e]) => setCote(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, actif]);
  return cote;
}

// 1.3.34 : animations en CSS (transform et opacité seulement, translate3d) : la carte graphique les joue sans
// passer par JavaScript, donc sans saccade même quand le lecteur se met à jour (temps, barre de lecture).
const CSS_IMAGES = `
@keyframes chay-img-x { from { transform: translate3d(0, -50%, 0); } to { transform: translate3d(var(--chay-d), -50%, 0); } }
@keyframes chay-img-y { from { transform: translate3d(-50%, 0, 0); } to { transform: translate3d(-50%, var(--chay-d), 0); } }
@keyframes chay-img-zoom { from { transform: scale(1); } to { transform: scale(1.07); } }
@keyframes chay-img-entre { from { opacity: 0; } to { opacity: 1; } }
.chay-img-anim { will-change: transform; backface-visibility: hidden; }
`;

function Photo({ src, w, h }) {
  return <img src={src} alt="" draggable={false} decoding="async" className="block shrink-0 select-none object-cover" style={{ width: w, height: h }} />;
}

/** Les photos glissent à la suite (horizontal : de droite à gauche ; vertical : de bas en haut), sans fin. */
function Bande({ g, cote, vertical }) {
  const { w, h } = tailleDansCase(g.ratio, cote);
  const pas = vertical ? h : w;
  const ecart = Math.round(cote * 0.04);
  const longueur = g.images.length * (pas + ecart);
  const suite = [...g.images, ...g.images];
  return (
    <div
      className={`chay-img-anim absolute flex ${vertical ? "left-1/2 top-0 flex-col" : "left-0 top-1/2 flex-row"}`}
      style={{
        gap: ecart,
        "--chay-d": `${-longueur}px`,
        animation: `${vertical ? "chay-img-y" : "chay-img-x"} ${dureeGroupe(g)}s linear infinite`,
      }}
    >
      {suite.map((src, i) => <Photo key={i} src={src} w={w} h={h} />)}
    </div>
  );
}

/** Une photo s'efface doucement pendant que la suivante apparaît, avec un zoom très lent. */
function Fondu({ g, cote }) {
  const [i, setI] = useState(0);
  const { w, h } = tailleDansCase(g.ratio, cote);
  useEffect(() => {
    const id = setInterval(() => setI((k) => k + 1), g.secondes * 1000);
    return () => clearInterval(id);
  }, [g]);
  // Deux couches : la photo d'avant reste dessous pendant que la nouvelle apparaît en fondu.
  const couches = [i - 1, i].filter((k) => k >= 0);
  return couches.map((k) => (
    <div
      key={k}
      className="absolute inset-0 grid place-items-center"
      style={{ animation: k === i && i > 0 ? "chay-img-entre 1.2s ease-in-out both" : undefined }}
    >
      <div className="chay-img-anim" style={{ animation: `chay-img-zoom ${g.secondes + 1.2}s linear both` }}>
        <Photo src={g.images[k % g.images.length]} w={w} h={h} />
      </div>
    </div>
  ));
}

function ImagesDefilantes({ piste }) {
  const [donnees, setDonnees] = useState(null);
  const [tour, setTour] = useState(0);
  const boite = useRef(null);
  useEffect(() => {
    let vivant = true;
    chargerImages().then((d) => { if (vivant) setDonnees(d); });
    return () => { vivant = false; };
  }, [piste?.id]); // relu à chaque titre (au plus toutes les 10 s)
  const groupes = useMemo(
    () => (donnees ? groupesPour(donnees.rows, piste, { parents: donnees.parents }) : []),
    [donnees, piste]
  );
  const g = groupes.length ? groupes[tour % groupes.length] : null;
  const cote = useCote(boite, groupes.length > 0); // la case n'existe qu'une fois les groupes connus
  // Plusieurs groupes (formats différents) : chacun fait un tour complet, puis le suivant.
  useEffect(() => {
    if (groupes.length < 2 || !g) return undefined;
    const id = setTimeout(() => setTour((t) => t + 1), dureeGroupe(g) * 1000);
    return () => clearTimeout(id);
  }, [g, groupes.length]);
  if (!groupes.length) return null;
  return (
    <div ref={boite} className="absolute inset-0 overflow-hidden bg-white dark:bg-black" aria-hidden="true">
      <style>{CSS_IMAGES}</style>
      {cote > 0 && g && (
        <AnimatePresence mode="wait">
          <motion.div key={`${g.id}-${tour}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {g.animation === "fondu" ? <Fondu g={g} cote={cote} /> : <Bande g={g} cote={cote} vertical={g.animation === "vertical"} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

// Le lecteur se redessine plusieurs fois par seconde (temps écoulé) : les photos, elles, ne bougent qu'avec le titre.
export default React.memo(ImagesDefilantes, (a, b) => a.piste?.id === b.piste?.id && a.piste?.playlist_id === b.piste?.playlist_id);
