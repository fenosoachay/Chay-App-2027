import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fondPour } from "@/lib/fondsSections";

// Fond plein écran animé de chaque section (1.3.35) : posé derrière tout le contenu (fixe, ne défile pas).
// Animations en CSS (transform et opacité seulement) : la carte graphique les joue sans saccade.
// Changement de section : fondu enchaîné d'un fond à l'autre. « Réduire les animations » : décor immobile.

const CSS_FONDS = `
@keyframes fs-scintille { 0%, 100% { opacity: .15; transform: scale(.6); } 50% { opacity: 1; transform: scale(1.15); } }
@keyframes fs-monte { 0% { opacity: 0; transform: translate3d(0, 0, 0); } 12% { opacity: var(--o, .8); } 88% { opacity: var(--o, .8); } 100% { opacity: 0; transform: translate3d(var(--dx, 0px), -105vh, 0); } }
@keyframes fs-flotte { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(var(--dx, 10px), var(--dy, -24px), 0); } }
@keyframes fs-respire { 0%, 100% { opacity: var(--o0, .55); transform: scale(1); } 50% { opacity: var(--o1, .9); transform: scale(1.08); } }
@keyframes fs-onde { 0% { opacity: .55; transform: translate(-50%, -50%) scale(.15); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); } }
@keyframes fs-balance { 0%, 100% { transform: rotate(-9deg); } 50% { transform: rotate(9deg); } }
@keyframes fs-aurore { 0%, 100% { transform: translate3d(-6%, 0, 0) scaleY(1) skewX(-8deg); opacity: .55; } 50% { transform: translate3d(6%, 3%, 0) scaleY(1.25) skewX(8deg); opacity: .95; } }
@keyframes fs-flamme { 0%, 100% { opacity: .75; transform: scale(1, 1); } 25% { opacity: 1; transform: scale(1.06, 1.12); } 50% { opacity: .82; transform: scale(.96, .98); } 75% { opacity: .95; transform: scale(1.03, 1.08); } }
@keyframes fs-balaye { 0% { transform: translate3d(-120%, 0, 0) rotate(20deg); } 100% { transform: translate3d(260%, 0, 0) rotate(20deg); } }
@keyframes fs-trait { 0%, 100% { opacity: .12; } 50% { opacity: .55; } }
@keyframes fs-nuage { from { transform: translate3d(-30vw, 0, 0); } to { transform: translate3d(130vw, 0, 0); } }
.fs-a { will-change: transform, opacity; animation-iteration-count: infinite; backface-visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .fs-a { animation: none !important; } }
`;

/** Suite pseudo-aléatoire stable (mêmes positions à chaque affichage). */
function suite(n, graine) {
  let h = 2166136261 ^ graine;
  return Array.from({ length: n }, () => {
    const t = [];
    for (let k = 0; k < 5; k++) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
      t.push(((h >>> 0) % 10000) / 10000);
    }
    return t;
  });
}

function Etoiles({ n = 26, graine = 1, couleur, lueur, haut = 100, taille = [1.5, 3.5] }) {
  const pts = useMemo(() => suite(n, graine), [n, graine]);
  return pts.map(([x, y, t, d, v], i) => (
    <span
      key={i}
      className="fs-a absolute rounded-full"
      style={{
        left: `${x * 100}%`, top: `${y * haut}%`, width: taille[0] + t * (taille[1] - taille[0]), height: taille[0] + t * (taille[1] - taille[0]),
        background: couleur, boxShadow: lueur ? `0 0 ${6 + t * 6}px ${1 + t * 2}px ${lueur}` : undefined,
        animation: `fs-scintille ${2.4 + v * 3}s ease-in-out ${d * 4}s infinite`,
      }}
    />
  ));
}

function Montee({ n = 14, graine = 2, rendu, duree = [14, 26] }) {
  const pts = useMemo(() => suite(n, graine), [n, graine]);
  return pts.map(([x, , t, d, v], i) => (
    <span
      key={i}
      className="fs-a absolute"
      style={{
        left: `${x * 100}%`, bottom: -40, opacity: 0, "--dx": `${(v - 0.5) * 80}px`, "--o": 0.35 + t * 0.55,
        animation: `fs-monte ${duree[0] + t * (duree[1] - duree[0])}s linear ${-d * duree[1]}s infinite`,
      }}
    >
      {rendu(t, i)}
    </span>
  ));
}

const LETTRES = ["A", "Ω", "ℵ", "Β", "Λ", "Σ", "Ж", "M", "Ψ", "R", "Δ", "Θ", "K", "E", "Φ", "Y"];

function Decor({ decor, nuit }) {
  const or = nuit ? "#FFD66E" : "#D9A63A";
  const lueurOr = nuit ? "rgba(255,184,0,0.55)" : "rgba(217,166,58,0.35)";
  switch (decor) {
    case "aube":
      return (
        <>
          <Etoiles n={30} graine={11} haut={62} couleur={or} lueur={lueurOr} />
          <div className="fs-a absolute top-[78%] h-[60vh] w-[110vw] rounded-[50%]" style={{ left: "-5vw", background: `radial-gradient(closest-side, ${nuit ? "rgba(255,190,90,0.38)" : "rgba(255,200,110,0.45)"}, transparent)`, "--o0": 0.6, "--o1": 1, animation: "fs-respire 9s ease-in-out infinite" }} />
        </>
      );
    case "lanternes":
      return (
        <Montee
          n={11}
          graine={21}
          duree={[22, 38]}
          rendu={(t) => (
            <span className="block rounded-full" style={{ width: 26 + t * 46, height: 26 + t * 46, background: `radial-gradient(closest-side, ${["rgba(255,184,107,0.75)", "rgba(255,138,200,0.6)", "rgba(255,214,110,0.7)"][Math.floor(t * 3) % 3]}, transparent)` }} />
          )}
        />
      );
    case "poussiere":
      return (
        <>
          <Montee n={22} graine={31} duree={[18, 34]} rendu={(t) => <span className="block rounded-full" style={{ width: 2 + t * 3, height: 2 + t * 3, background: or, boxShadow: `0 0 6px ${lueurOr}` }} />} />
          <div className="absolute inset-x-0 top-0 h-[45%]" style={{ background: `radial-gradient(60% 80% at 50% 0%, ${nuit ? "rgba(255,214,110,0.12)" : "rgba(255,214,110,0.25)"}, transparent)` }} />
        </>
      );
    case "ondes":
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="fs-a absolute left-1/2 top-[38%] h-[120vmax] w-[120vmax] rounded-full border" style={{ borderColor: "rgba(255,214,110,0.35)", borderWidth: 2, opacity: 0, animation: `fs-onde 10s ease-out ${i * 2.5}s infinite` }} />
          ))}
          <Etoiles n={18} graine={41} couleur={or} lueur={lueurOr} />
        </>
      );
    case "lettres":
      return (
        <Montee
          n={16}
          graine={51}
          duree={[26, 44]}
          rendu={(t, i) => <span className="block font-serif font-bold" style={{ fontSize: 22 + t * 34, color: "rgba(255,214,110,0.22)", transform: `rotate(${(t - 0.5) * 40}deg)` }}>{LETTRES[i % LETTRES.length]}</span>}
        />
      );
    case "constellation": {
      const pts = [[12, 14], [26, 22], [38, 12], [52, 26], [70, 18], [84, 30], [18, 48], [34, 58], [58, 52], [76, 64], [88, 50], [46, 78], [22, 84], [66, 86]];
      const liens = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [8, 9], [9, 10], [7, 11], [11, 12], [11, 13], [3, 8]];
      return (
        <>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {liens.map(([a, b], i) => (
              <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="#FFD66E" strokeWidth="0.15" vectorEffect="non-scaling-stroke" className="fs-a" style={{ animation: `fs-trait ${5 + (i % 4)}s ease-in-out ${i * 0.6}s infinite`, strokeWidth: 1 }} />
            ))}
          </svg>
          {pts.map(([x, y], i) => (
            <span key={i} className="fs-a absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: 4, height: 4, marginLeft: -2, marginTop: -2, background: "#FFE9A8", boxShadow: "0 0 10px 3px rgba(255,214,110,0.6)", animation: `fs-scintille ${3 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }} />
          ))}
          <Etoiles n={30} graine={61} couleur="#cfd8ff" taille={[1, 2]} />
        </>
      );
    }
    case "scene":
      return (
        <>
          <div className="fs-a absolute top-[-10vh] h-[120vh] w-[90vw] origin-top" style={{ left: "5vw", animation: "fs-balance 14s ease-in-out infinite" }}>
            <div className="h-full w-full" style={{ background: `radial-gradient(42% 80% at 50% 0%, ${nuit ? "rgba(255,214,110,0.32)" : "rgba(255,200,120,0.45)"}, transparent 75%)` }} />
          </div>
          <Montee n={16} graine={71} duree={[20, 34]} rendu={(t) => <span className="block rounded-full" style={{ width: 2 + t * 2, height: 2 + t * 2, background: nuit ? "rgba(255,230,180,0.8)" : "rgba(190,120,60,0.5)" }} />} />
        </>
      );
    case "eaux":
      return (
        <>
          {[14, 40, 66, 86].map((x, i) => (
            <div key={x} className="absolute -top-10 h-[130vh] w-28 origin-top" style={{ left: `${x - 5}%`, transform: `rotate(${-12 + i * 7}deg)` }}>
              <div className="fs-a h-full w-full" style={{ background: "radial-gradient(50% 60% at 50% 0%, rgba(96,214,255,0.3), transparent 80%)", "--o0": 0.35, "--o1": 0.75, animation: `fs-respire ${8 + i * 1.6}s ease-in-out infinite` }} />
            </div>
          ))}
          <Montee n={14} graine={81} duree={[12, 22]} rendu={(t) => <span className="block rounded-full border border-white/40 bg-white/10" style={{ width: 6 + t * 14, height: 6 + t * 14 }} />} />
        </>
      );
    case "veillee":
      return (
        <>
          <div className="fs-a absolute right-[12%] top-[9%] h-24 w-24 rounded-full" style={{ background: nuit ? "radial-gradient(circle at 40% 40%, #fffbe6, #fff0b3 60%, #f3d77a)" : "radial-gradient(circle at 40% 40%, #fffdf0, #ffe58a 60%, #ffc94d)", boxShadow: nuit ? "0 0 60px 20px rgba(255,240,180,0.35)" : "0 0 60px 24px rgba(255,214,110,0.45)", "--o0": 0.9, "--o1": 1, animation: "fs-respire 6s ease-in-out infinite" }} />
          <Etoiles n={22} graine={91} haut={70} couleur={nuit ? "#fff6d0" : "#ffcf5a"} lueur={nuit ? "rgba(255,246,208,0.7)" : "rgba(255,200,80,0.5)"} taille={[2.5, 6]} />
          {[0, 1].map((i) => (
            <span key={i} className="fs-a absolute h-14 w-48 rounded-full" style={{ top: `${22 + i * 30}%`, left: 0, background: nuit ? "radial-gradient(closest-side, rgba(255,255,255,0.12), transparent)" : "radial-gradient(closest-side, rgba(255,255,255,0.85), transparent)", animation: `fs-nuage ${70 + i * 30}s linear ${-i * 35}s infinite` }} />
          ))}
        </>
      );
    case "aurore":
      return (
        <>
          {[["rgba(47,224,176,0.38)", 18, 0], ["rgba(138,107,255,0.3)", 34, 4], ["rgba(47,200,224,0.25)", 50, 8]].map(([c, top, d], i) => (
            <div key={i} className="fs-a absolute -left-[20%] h-[34vh] w-[140%]" style={{ top: `${top}%`, background: `radial-gradient(50% 50% at 50% 50%, ${c}, transparent 72%)`, animation: `fs-aurore ${16 + i * 5}s ease-in-out ${-d}s infinite` }} />
          ))}
          {nuit && <Etoiles n={20} graine={101} couleur="#d8fff4" taille={[1, 2.2]} />}
        </>
      );
    case "chandelles":
      return (
        <>
          {[8, 24, 50, 76, 92].map((x, i) => (
            <div key={x} className="absolute bottom-0" style={{ left: `${x}%`, transform: "translateX(-50%)" }}>
              <div className="fs-a h-40 w-28 origin-bottom" style={{ background: `radial-gradient(50% 60% at 50% 70%, ${nuit ? "rgba(255,207,107,0.45)" : "rgba(255,190,90,0.4)"}, transparent 75%)`, animation: `fs-flamme ${2.2 + (i % 3) * 0.5}s ease-in-out ${i * 0.3}s infinite` }} />
            </div>
          ))}
          <Montee n={14} graine={111} duree={[10, 18]} rendu={(t) => <span className="block rounded-full" style={{ width: 2 + t * 2, height: 2 + t * 2, background: "#FFC76A", boxShadow: "0 0 6px rgba(255,170,60,0.7)" }} />} />
        </>
      );
    case "graphite":
      return (
        <>
          <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(0deg, ${nuit ? "rgba(201,160,82,0.07)" : "rgba(201,160,82,0.12)"} 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, ${nuit ? "rgba(201,160,82,0.07)" : "rgba(201,160,82,0.12)"} 0 1px, transparent 1px 28px)` }} />
          <div className="fs-a absolute -top-1/4 left-0 h-[150%] w-[30%]" style={{ background: `linear-gradient(90deg, transparent, ${nuit ? "rgba(255,214,110,0.09)" : "rgba(255,214,110,0.22)"}, transparent)`, animation: "fs-balaye 11s ease-in-out infinite" }} />
        </>
      );
    default:
      return null;
  }
}

/** Fond de la section `cle` (voir lib/fondsSections.js). `absolu` : dans un écran plein (conversation). */
export default function FondSection({ cle, sombre = true, absolu = false }) {
  const f = fondPour(cle, sombre);
  return (
    <div className={`pointer-events-none ${absolu ? "absolute" : "fixed"} inset-0 z-0 overflow-hidden`} aria-hidden="true">
      <style>{CSS_FONDS}</style>
      <AnimatePresence initial={false}>
        {f && (
          <motion.div
            key={`${f.cle}-${f.nuit}`}
            className="absolute inset-0"
            style={{ background: f.fond }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Decor decor={f.decor} nuit={f.nuit} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
