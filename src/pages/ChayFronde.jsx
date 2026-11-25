import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, RotateCcw, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerScore } from "@/lib/scoreBoard";
import { jouerSon } from "@/lib/sonsJeu";
import { chargerProgresJeu, enregistrerProgresJeu } from "@/lib/progresJeu";
import BoutonSon from "@/components/BoutonSon";
import {
  FRONDE, LARGEUR, NIVEAUX, SOL, TIRAGE_MAX, auRepos, avancer, creerMonde, etoilesFronde, lancement, pointsFronde, tirer, trajectoire,
} from "@/lib/fronde";

// Chay Fronde (1.3.32, Chay PlayMobile) : façon lance-pierre. On tire des pierres avec la fronde sur des
// constructions en bois et en pierre ; les cibles sont les photos des personnes « En service » (Menu ☰), qui
// disparaissent dans un pouf d'étoiles quand on les touche. 20 niveaux ; étoiles selon les pierres qui restent.
// Progrès gardé sur le compte (ProgresJeu, jeu « fronde » : { etoiles: { [niveau]: 1..3 } }).
// La partie se joue en plein écran, à l'horizontale : si le téléphone est tenu droit, le jeu est tourné d'un
// quart de tour (on tourne le téléphone) ; le ciel et le sol s'étendent jusqu'aux bords de l'écran.

// Partie du monde toujours visible (les constructions commencent vers y = 108 ; le sol à 580).
const VUE = { y0: 70, h: 540 };

const Etoiles = ({ n, taille = "h-3 w-3" }) => (
  <span className="flex justify-center gap-0.5">
    {[1, 2, 3].map((i) => <Star key={i} className={`${taille} ${i <= n ? "fill-[#FFB400] text-[#FFB400]" : "text-foreground/25"}`} />)}
  </span>
);

const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();

/** Dessine une étoile à 5 branches. */
function etoile(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function dessiner(ctx, m, visee, images) {
  // Ciel, collines, sol
  const ciel = ctx.createLinearGradient(0, 0, 0, SOL);
  ciel.addColorStop(0, "#7cc6ff");
  ciel.addColorStop(1, "#d9f1ff");
  ctx.fillStyle = ciel;
  ctx.fillRect(-3000, -3000, LARGEUR + 6000, SOL + 3000);
  ctx.fillStyle = "#bfe3a8";
  ctx.beginPath();
  ctx.moveTo(-3000, SOL);
  for (let x = -3000; x <= LARGEUR + 3000; x += 20) ctx.lineTo(x, SOL - 70 - Math.sin(x / 90) * 30 - Math.sin(x / 37) * 8);
  ctx.lineTo(LARGEUR + 3000, SOL);
  ctx.fill();
  ctx.fillStyle = "#6fbf4a";
  ctx.fillRect(-3000, SOL, LARGEUR + 6000, 10);
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(-3000, SOL + 10, LARGEUR + 6000, 3000);

  // Fronde (arrière)
  const pierreVisee = visee ? { x: FRONDE.x + visee.dx, y: FRONDE.y + visee.dy } : null;
  ctx.strokeStyle = "#5b3418";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(FRONDE.x, SOL);
  ctx.lineTo(FRONDE.x, FRONDE.y + 40);
  ctx.lineTo(FRONDE.x - 18, FRONDE.y - 8);
  ctx.moveTo(FRONDE.x, FRONDE.y + 40);
  ctx.lineTo(FRONDE.x + 18, FRONDE.y - 8);
  ctx.stroke();
  if (pierreVisee) {
    ctx.strokeStyle = "#3b2414";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(FRONDE.x - 18, FRONDE.y - 8);
    ctx.lineTo(pierreVisee.x, pierreVisee.y);
    ctx.lineTo(FRONDE.x + 18, FRONDE.y - 8);
    ctx.stroke();
    // Trajectoire prévue
    const v = lancement(visee.dx, visee.dy);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    trajectoire(v.vx, v.vy).forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 4 - i * 0.15), 0, Math.PI * 2); ctx.fill(); });
  }

  // Blocs
  for (const b of m.blocs) {
    const bois = b.materiau === "bois";
    const abime = b.pv < (bois ? 60 : 160);
    ctx.fillStyle = bois ? (abime ? "#a9733a" : "#d39a4a") : (abime ? "#7f8892" : "#a7b0bb");
    ctx.strokeStyle = bois ? "#7a4a1d" : "#5f6670";
    ctx.lineWidth = 2;
    const x = b.x - b.w / 2;
    const y = b.y - b.h / 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, b.w, b.h, 4) : ctx.rect(x, y, b.w, b.h);
    ctx.fill();
    ctx.stroke();
    if (bois) { // veines du bois
      ctx.strokeStyle = "rgba(122,74,29,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.w > b.h) { ctx.moveTo(x + 6, b.y - 2); ctx.lineTo(x + b.w - 6, b.y - 2); } else { ctx.moveTo(b.x - 2, y + 6); ctx.lineTo(b.x - 2, y + b.h - 6); }
      ctx.stroke();
    }
    if (abime) {
      ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.beginPath();
      ctx.moveTo(b.x - 4, y + 2); ctx.lineTo(b.x + 3, b.y); ctx.lineTo(b.x - 2, y + b.h - 2);
      ctx.stroke();
    }
  }

  // Cibles (photos)
  for (const c of m.cibles) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.closePath();
    const img = c.photo && images.get(c.photo.url);
    if (img && img.complete && img.naturalWidth) {
      ctx.clip();
      const s = Math.max((c.r * 2) / img.naturalWidth, (c.r * 2) / img.naturalHeight);
      ctx.drawImage(img, c.x - (img.naturalWidth * s) / 2, c.y - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    } else {
      ctx.fillStyle = "#8A56E2";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initiales(c.photo?.nom), c.x, c.y + 1);
    }
    ctx.restore();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Pierres
  for (const p of m.pierres) {
    const g = ctx.createRadialGradient(p.x - 4, p.y - 4, 2, p.x, p.y, p.r);
    g.addColorStop(0, "#c9ced4");
    g.addColorStop(1, "#5f6670");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pierre dans la fronde
  if (m.reste > 0 && !m.pierres.some((p) => p.vie < 0.4)) {
    const px = pierreVisee ? pierreVisee.x : FRONDE.x;
    const py = pierreVisee ? pierreVisee.y : FRONDE.y;
    ctx.fillStyle = "#7d858f";
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pierres qui restent
  for (let i = 0; i < Math.max(0, m.reste - 1); i += 1) {
    ctx.fillStyle = "#7d858f";
    ctx.beginPath();
    ctx.arc(FRONDE.x - 40 - i * 22, SOL - 10, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Poufs d'étoiles et éclats
  for (const p of m.poufs) {
    const k = p.t / 0.7;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = "#FFD23F";
    for (let i = 0; i < 9; i += 1) {
      const a = (Math.PI * 2 * i) / 9 + k;
      etoile(ctx, p.x + Math.cos(a) * 60 * k, p.y + Math.sin(a) * 60 * k - 20 * k, 7 * (1 - k * 0.5));
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 22 * (1 - k), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const e of m.eclats) {
    const k = e.t / 0.5;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = e.couleur;
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI * 2 * i) / 6;
      ctx.fillRect(e.x + Math.cos(a) * 40 * k, e.y + Math.sin(a) * 40 * k + 30 * k * k, 7, 4);
    }
    ctx.globalAlpha = 1;
  }
}

function Partie({ n, photos, onFin, onQuitter }) {
  const canvasRef = useRef(null);
  const monde = useRef(null);
  const visee = useRef(null);
  const tir = useRef(null); // { depuis } : temps depuis le dernier tir
  const images = useRef(new Map());
  const camera = useRef({ s: 1, ox: 0, oy: 0 }); // écran (px CSS) = monde × s + décalage
  const tourne = useTourne();
  const [etat, setEtat] = useState({ reste: 0, cibles: 0, statut: "jeu" });
  const [essai, setEssai] = useState(0);

  // Images des photos
  useEffect(() => {
    for (const p of photos) {
      if (!p.url || images.current.has(p.url)) continue;
      const img = new Image();
      img.src = p.url;
      images.current.set(p.url, img);
    }
  }, [photos]);

  const recommencer = useCallback(() => {
    monde.current = creerMonde(n, photos);
    tir.current = null;
    visee.current = null;
    setEtat({ reste: monde.current.reste, cibles: monde.current.cibles.length, statut: "jeu" });
    setEssai((x) => x + 1);
  }, [n, photos]);
  useEffect(() => { recommencer(); }, [recommencer]);

  // Boucle de jeu
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let image = 0;
    let avant = performance.now();
    let dernierSon = 0;
    let finie = false;
    const boucle = (t) => {
      const dt = Math.min(0.033, (t - avant) / 1000);
      avant = t;
      const m = monde.current;
      if (m) {
        const ev = avancer(m, dt);
        if (ev.poufs) { jouerSon("bon"); setEtat((e) => ({ ...e, cibles: m.cibles.length })); }
        else if ((ev.casses || ev.chocs) && t - dernierSon > 140) { jouerSon("pose"); dernierSon = t; }
        if (tir.current) {
          tir.current.depuis += dt;
          const fini = (auRepos(m) && tir.current.depuis > 1.2) || tir.current.depuis > 6;
          if (fini || !m.cibles.length) {
            tir.current = null;
            if (!m.cibles.length && !finie) {
              finie = true;
              setTimeout(() => onFin(m.reste, setEtat), 700);
            } else if (m.reste <= 0 && m.cibles.length && !finie) {
              finie = true;
              jouerSon("fin");
              setEtat((e) => ({ ...e, statut: "perdu" }));
            }
          }
        }
        // Dessin plein écran (net sur les écrans haute densité) : le monde est centré, la vue y0..y0+h
        // remplit la hauteur ; le décor déborde jusqu'aux bords.
        const r = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * r) || canvas.height !== Math.round(h * r)) {
          canvas.width = Math.round(w * r);
          canvas.height = Math.round(h * r);
        }
        const s = Math.min(w / LARGEUR, h / VUE.h);
        const ox = (w - LARGEUR * s) / 2;
        const oy = h - (VUE.y0 + VUE.h) * s;
        camera.current = { s, ox, oy };
        const ctx = canvas.getContext("2d");
        ctx.setTransform(s * r, 0, 0, s * r, ox * r, oy * r);
        dessiner(ctx, m, visee.current, images.current);
      }
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(image);
  }, [essai, onFin]);

  // Viser et tirer
  const point = (e) => {
    // Le jeu occupe tout l'écran ; tourné d'un quart de tour, l'axe x du jeu descend l'écran.
    const lx = tourne ? e.clientY : e.clientX;
    const ly = tourne ? window.innerWidth - e.clientX : e.clientY;
    const { s, ox, oy } = camera.current;
    return { x: (lx - ox) / s, y: (ly - oy) / s };
  };
  const down = (e) => {
    const m = monde.current;
    if (!m || m.reste <= 0 || tir.current || etat.statut !== "jeu") return;
    const p = point(e);
    if (Math.hypot(p.x - FRONDE.x, p.y - FRONDE.y) > 110) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    visee.current = { dx: 0, dy: 0 };
  };
  const move = (e) => {
    if (!visee.current) return;
    const p = point(e);
    let dx = p.x - FRONDE.x;
    let dy = p.y - FRONDE.y;
    const d = Math.hypot(dx, dy);
    if (d > TIRAGE_MAX) { dx *= TIRAGE_MAX / d; dy *= TIRAGE_MAX / d; }
    visee.current = { dx, dy };
  };
  const up = () => {
    const v = visee.current;
    visee.current = null;
    if (!v || Math.hypot(v.dx, v.dy) < 18) return;
    tirer(monde.current, v.dx, v.dy);
    tir.current = { depuis: 0 };
    jouerSon("clic");
    setEtat((e) => ({ ...e, reste: monde.current.reste }));
  };

  const bouton = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50";
  return (
    <PleinEcran tourne={tourne}>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { visee.current = null; }}
        className="absolute inset-0 block h-full w-full touch-none select-none"
        aria-label="Terrain de jeu : tire la fronde vers l'arrière puis lâche"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 p-3" style={{ paddingLeft: "max(0.75rem, env(safe-area-inset-left))", paddingRight: "max(0.75rem, env(safe-area-inset-right))" }}>
        <button type="button" onClick={() => onQuitter()} aria-label="Niveaux" className={`pointer-events-auto ${bouton}`}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="rounded-full bg-black/35 px-3 py-2 font-display text-base font-extrabold text-white backdrop-blur">Niveau {n + 1}</span>
        <span className="flex-1" />
        <span className="rounded-full bg-black/35 px-3 py-2 text-sm font-bold text-white backdrop-blur">🪨 {etat.reste}</span>
        <span className="rounded-full bg-black/35 px-3 py-2 text-sm font-bold text-white backdrop-blur">🎯 {etat.cibles}</span>
        <span className="pointer-events-auto"><BoutonSon /></span>
        <button type="button" onClick={recommencer} aria-label="Recommencer" className={`pointer-events-auto ${bouton}`}>
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>
      {etat.statut !== "jeu" && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-background p-5 text-center shadow-2xl">
            {etat.statut === "gagne" ? (
              <>
                <h2 className="text-2xl font-black">🎉 Bravo !</h2>
                <div className="my-2"><Etoiles n={etat.etoiles} taille="h-8 w-8" /></div>
                {etat.points > 0 && <p className="text-sm font-bold text-primary">+{etat.points} points</p>}
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black">🪨 Plus de pierres !</h2>
                <p className="text-sm text-foreground/60">Il reste {etat.cibles} cible{etat.cibles > 1 ? "s" : ""}. Essaie encore !</p>
              </>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {etat.statut === "gagne" && n < NIVEAUX.length - 1 && (
                <button type="button" onClick={() => onQuitter(n + 1)} className="min-h-11 rounded-full brand-gradient px-5 font-extrabold text-white">Niveau suivant</button>
              )}
              <button type="button" onClick={recommencer} className="min-h-11 rounded-full border border-border px-5 font-bold">Rejouer</button>
              <button type="button" onClick={() => onQuitter()} className="min-h-11 rounded-full px-4 font-bold text-foreground/70">Tous les niveaux</button>
            </div>
          </div>
        </motion.div>
      )}
    </PleinEcran>
  );
}

/** Vrai quand l'écran est plus haut que large : le jeu est alors tourné d'un quart de tour. */
function useTourne() {
  const calc = () => typeof window !== "undefined" && window.innerHeight > window.innerWidth;
  const [tourne, setTourne] = useState(calc);
  useEffect(() => {
    const maj = () => setTourne(calc());
    window.addEventListener("resize", maj);
    window.addEventListener("orientationchange", maj);
    return () => { window.removeEventListener("resize", maj); window.removeEventListener("orientationchange", maj); };
  }, []);
  return tourne;
}

/** Couvre tout l'écran (au-dessus du menu et de la barre du bas), à l'horizontale. Essaie aussi le vrai
 *  plein écran et le verrouillage paysage quand l'appareil le permet. */
function PleinEcran({ tourne, children }) {
  useEffect(() => {
    const doc = document.documentElement;
    let ouvert = false;
    (async () => {
      try {
        if (doc.requestFullscreen && !document.fullscreenElement) { await doc.requestFullscreen({ navigationUI: "hide" }); ouvert = true; }
        await globalThis.screen?.orientation?.lock?.("landscape");
      } catch { /* pas possible ici : la rotation CSS prend le relais */ }
    })();
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = avant;
      try { globalThis.screen?.orientation?.unlock?.(); } catch { /* rien */ }
      if (ouvert && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  const style = tourne
    ? { position: "absolute", top: 0, left: 0, width: "100vh", height: "100vw", transformOrigin: "top left", transform: "rotate(90deg) translateY(-100%)" }
    : { position: "absolute", inset: 0 };
  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-[#7cc6ff]">
      <div style={style}>{children}</div>
    </div>
  );
}

export default function ChayFronde() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progres, setProgres] = useState({ id: null, donnees: {} });
  const [photos, setPhotos] = useState([]);
  const [niveau, setNiveau] = useState(null);
  const etoiles = progres.donnees?.etoiles || {};
  const progresRef = useRef(progres);
  progresRef.current = progres;

  useEffect(() => { chargerProgresJeu(user?.id, "fronde").then(setProgres).catch(() => {}); }, [user?.id]);
  // Les personnes « En service » (Menu ☰) : leurs photos sont les cibles.
  useEffect(() => {
    base44.entities.StaffMember.list(undefined, 100)
      .then((rows) => setPhotos((Array.isArray(rows) ? rows : []).map((s) => ({ url: s.photo_url || "", nom: s.name })).filter((p) => p.url || p.nom)))
      .catch(() => setPhotos([]));
  }, []);

  const fin = useCallback((reste, setEtat) => {
    const nb = etoilesFronde(reste);
    const p = progresRef.current;
    const avant = p.donnees?.etoiles?.[niveau + 1] || 0;
    const points = avant ? 0 : pointsFronde(niveau + 1, nb);
    jouerSon("victoire");
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.45 }, colors: ["#FFD23F", "#7cc6ff", "#6fbf4a", "#FFFFFF"] });
    setEtat((e) => ({ ...e, statut: "gagne", etoiles: nb, points }));
    if (!avant) enregistrerScore("fronde", { niveau: niveau + 1, etoiles: nb });
    if (nb > avant && user?.id) {
      const donnees = { ...p.donnees, etoiles: { ...(p.donnees?.etoiles || {}), [niveau + 1]: nb } };
      setProgres((x) => ({ ...x, donnees }));
      enregistrerProgresJeu(user.id, "fronde", p.id, donnees).then((id) => setProgres((x) => ({ ...x, id }))).catch(() => {});
    }
  }, [niveau, user?.id]);

  if (niveau !== null) {
    return (
      <Partie key={niveau} n={niveau} photos={photos} onFin={fin} onQuitter={(suivant) => setNiveau(typeof suivant === "number" ? suivant : null)} />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={() => navigate("/games")} aria-label="Retour aux jeux" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 font-display text-3xl font-extrabold">Chay Fronde</h1>
        <BoutonSon />
      </div>
      <p className="mb-5 text-center text-sm text-foreground/65">Comme David avec sa fronde : renverse les constructions et touche toutes les cibles ! Tourne ton téléphone : le jeu se joue à l'horizontale.</p>
      <div className="grid grid-cols-5 gap-2.5">
        {NIVEAUX.map((_, i) => {
          const ouvert = i === 0 || etoiles[i] > 0;
          return (
            <button
              key={i}
              type="button"
              disabled={!ouvert}
              onClick={() => setNiveau(i)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl text-lg font-black transition active:scale-95 ${
                ouvert ? "bg-gradient-to-br from-[#7cc6ff] to-[#4A6CFE] text-white shadow-sm" : "bg-muted text-foreground/30"
              }`}
              aria-label={ouvert ? `Niveau ${i + 1}` : `Niveau ${i + 1}, fermé`}
            >
              {ouvert ? i + 1 : <Lock className="h-5 w-5" />}
              {etoiles[i + 1] > 0 && <Etoiles n={etoiles[i + 1]} taille="h-2.5 w-2.5" />}
            </button>
          );
        })}
      </div>
    </main>
  );
}
