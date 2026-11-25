import React, { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { bougerBulles, creerBulles } from "@/lib/bulles";

// 1.3.34 : les jeux d'une catégorie flottent comme des bulles au fond de l'eau. Elles ne s'arrêtent jamais de
// bouger et glissent doucement du côté où l'on penche le téléphone. Seulement les icônes (nom lu par les
// lecteurs d'écran). Décor : rayons de lumière, plancton, petites bulles qui montent, poissons au loin.

const HAUTEUR = 360;

const THEMES = {
  game: { fond: "linear-gradient(180deg, #0b3a5c 0%, #072540 45%, #03101f 100%)", lueur: "rgba(96, 214, 255, 0.35)", poisson: "#7fd3ff" },
  playmobile: { fond: "linear-gradient(180deg, #2a1d63 0%, #170f3f 45%, #07051a 100%)", lueur: "rgba(190, 140, 255, 0.35)", poisson: "#c9a7ff" },
};

/** Inclinaison du téléphone, adoucie (x, y entre -1 et 1). */
function useInclinaison() {
  const ref = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const surOrientation = (e) => {
      const g = Number(e.gamma) || 0; // gauche / droite
      const b = Number(e.beta) || 0; // avant / arrière (tenu droit ≈ 45°)
      ref.current = { x: Math.max(-1, Math.min(1, g / 35)), y: Math.max(-1, Math.min(1, (b - 40) / 35)) };
    };
    globalThis.addEventListener?.("deviceorientation", surOrientation);
    return () => globalThis.removeEventListener?.("deviceorientation", surOrientation);
  }, []);
  return ref;
}

function Decor({ theme }) {
  const plancton = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: (i * 37) % 100, y: (i * 61) % 100, d: 6 + (i % 5) * 2, t: 1 + (i % 3),
  })), []);
  const montee = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: 6 + i * 11, d: 7 + (i % 4) * 2.5, r: 3 + (i % 3) * 2, w: i * 0.9 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Rayons de lumière venus de la surface */}
      {[12, 38, 66, 84].map((x, i) => (
        <motion.div
          key={x}
          className="absolute -top-10 h-[130%] w-16 origin-top"
          style={{ left: `${x}%`, background: `linear-gradient(180deg, ${theme.lueur}, transparent 75%)`, filter: "blur(6px)" }}
          animate={{ rotate: [-14 + i * 6, -8 + i * 6, -14 + i * 6], opacity: [0.25, 0.55, 0.25] }}
          transition={{ duration: 7 + i * 1.7, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* Plancton qui scintille */}
      {plancton.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.t, height: p.t }}
          animate={{ opacity: [0.1, 0.7, 0.1], y: [0, -8, 0] }}
          transition={{ duration: p.d, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }}
        />
      ))}
      {/* Petites bulles qui montent */}
      {montee.map((m, i) => (
        <motion.span
          key={`m${i}`}
          className="absolute rounded-full border border-white/40 bg-white/10"
          style={{ left: `${m.x}%`, bottom: -10, width: m.r * 2, height: m.r * 2 }}
          animate={{ y: [0, -HAUTEUR - 30], x: [0, 6, -6, 0], opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: m.d, repeat: Infinity, delay: m.w, ease: "linear" }}
        />
      ))}
      {/* Poissons au loin */}
      {[0, 1].map((i) => (
        <motion.svg
          key={`p${i}`}
          viewBox="0 0 40 16"
          className="absolute h-4 w-10"
          style={{ top: `${28 + i * 38}%`, opacity: 0.22 }}
          initial={{ x: i ? 420 : -60 }}
          animate={{ x: i ? -60 : 420 }}
          transition={{ duration: 26 + i * 9, repeat: Infinity, ease: "linear", delay: i * 6 }}
        >
          <path d={i ? "M40 8 C28 0 14 0 8 8 C14 16 28 16 40 8 Z M8 8 L0 2 L0 14 Z" : "M0 8 C12 0 26 0 32 8 C26 16 12 16 0 8 Z M32 8 L40 2 L40 14 Z"} fill={theme.poisson} />
        </motion.svg>
      ))}
      {/* Fond sableux et ombre du large */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "radial-gradient(120% 100% at 50% 100%, rgba(255,255,255,0.08), transparent 70%)" }} />
    </div>
  );
}

function Bulle({ jeu, taille, onOpen, refEl }) {
  const Icone = jeu.icon;
  return (
    <button
      ref={refEl}
      type="button"
      onClick={() => onOpen(jeu.path)}
      aria-label={`Ouvrir le jeu ${jeu.name}`}
      title={jeu.name}
      className="absolute left-0 top-0 grid place-items-center rounded-full will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{
        width: taille,
        height: taille,
        background: "radial-gradient(circle at 50% 50%, rgba(160,225,255,0.06) 0 55%, rgba(120,200,255,0.28) 88%, rgba(255,255,255,0.6) 100%)",
        boxShadow: "inset 0 0 18px rgba(170,230,255,0.35), inset -6px -10px 18px rgba(0,30,60,0.35), 0 8px 24px rgba(0,0,0,0.25)",
        backdropFilter: "blur(1.5px)",
      }}
    >
      <span className={`grid h-[52%] w-[52%] place-items-center rounded-full bg-gradient-to-br ${jeu.tone} text-white shadow-[0_0_22px_rgba(255,255,255,0.35)]`}>
        {jeu.placeholder ? <span className="text-xl" aria-hidden="true">⏳</span> : <Icone className="h-[55%] w-[55%]" aria-hidden="true" />}
      </span>
      {/* reflet en arc */}
      <span className="pointer-events-none absolute left-[20%] top-[13%] h-[12%] w-[26%] -rotate-[30deg] rounded-full" style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.85), rgba(255,255,255,0))" }} aria-hidden="true" />
    </button>
  );
}

export default function EauxProfondes({ jeux, onOpen, slot = "game" }) {
  const theme = THEMES[slot] || THEMES.game;
  const boite = useRef(null);
  const els = useRef([]);
  const inclinaison = useInclinaison();
  const liste = jeux.length ? jeux : [{ id: "bientot", name: "Bientôt", path: null, placeholder: true, tone: "from-slate-500 to-slate-700" }];
  const taille = liste.length > 4 ? 84 : 96;

  useEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    let largeur = el.clientWidth || 340;
    let bulles = creerBulles(liste.length, largeur, HAUTEUR, taille / 2);
    const tilt = { x: 0, y: 0 };
    let precedent = performance.now();
    let id;
    const image = (t) => {
      const dt = Math.min(48, t - precedent) / 16.67;
      precedent = t;
      const w = el.clientWidth || largeur;
      if (Math.abs(w - largeur) > 1) { largeur = w; bulles = creerBulles(liste.length, largeur, HAUTEUR, taille / 2, bulles); }
      // Lent et doux : l'inclinaison est rejointe peu à peu.
      tilt.x += (inclinaison.current.x - tilt.x) * 0.04;
      tilt.y += (inclinaison.current.y - tilt.y) * 0.04;
      bulles = bougerBulles(bulles, { t, dt, largeur, hauteur: HAUTEUR, tilt });
      bulles.forEach((b, i) => {
        const n = els.current[i];
        if (n) n.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0) scale(${b.s})`;
      });
      id = requestAnimationFrame(image);
    };
    id = requestAnimationFrame(image);
    return () => cancelAnimationFrame(id);
  }, [liste.length, taille, inclinaison]);

  return (
    <div
      ref={boite}
      className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[1.75rem] shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]"
      style={{ height: HAUTEUR, background: theme.fond }}
    >
      <Decor theme={theme} />
      {liste.map((j, i) => (
        <Bulle
          key={j.id}
          jeu={j}
          taille={taille}
          onOpen={(p) => { if (p) onOpen(p); }}
          refEl={(n) => { els.current[i] = n; }}
        />
      ))}
    </div>
  );
}
