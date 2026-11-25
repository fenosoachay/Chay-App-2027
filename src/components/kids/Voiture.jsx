import React, { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, RotateCcw, Star } from "lucide-react";
import NIVEAUX from "@/data/niveauxVoiture.json";
import { enregistrerScore } from "@/lib/scoreBoard";
import { enregistrerProgres } from "@/lib/profilsEnfants";
import { jouerSon } from "@/lib/sonsJeu";
import { useBackHandler } from "@/hooks/useBackHandler";
import { LIGNE_SORTIE, TAILLE, course, deplacer, etoiles, gagne, lireNiveau, progresApres } from "@/lib/voiture";

// « Libère la voiture » (1.3.30, Chay Enfants › Jeux) : fais glisser les voitures et les camions pour que la
// voiture rouge sorte du garage par la flèche. 30 niveaux, du plus facile au plus difficile ; on ouvre le
// suivant en réussissant. Étoiles selon le nombre de coups ; points au Score Board des enfants ; progrès de
// chaque enfant gardé sur le compte (ProfilEnfant.progres.voiture).

const ECART = 4; // px entre les cases
const COULEURS = ["#4A90E2", "#3EC28F", "#FFB400", "#A066E8", "#FF7AC6", "#2BB6C4", "#8BC34A", "#FF8A3D"];

function Etoiles({ n, taille = "h-3.5 w-3.5" }) {
  return (
    <span className="flex justify-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star key={i} className={`${taille} ${i <= n ? "fill-[#FFB400] text-[#FFB400]" : "text-foreground/25"}`} />
      ))}
    </span>
  );
}

function ChoixNiveau({ progres, onChoisir }) {
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-4 text-center text-sm text-foreground/65">Fais glisser les voitures pour faire sortir la voiture rouge du garage !</p>
      <div className="grid grid-cols-5 gap-2.5">
        {NIVEAUX.map((_, i) => {
          const n = i + 1;
          const ouvert = n <= progres.niveau;
          return (
            <button
              key={n}
              type="button"
              disabled={!ouvert}
              onClick={() => onChoisir(n)}
              className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl text-lg font-black transition ${
                ouvert ? "bg-gradient-to-br from-[#FF5A5F] to-[#FFB400] text-white shadow-sm active:scale-95" : "bg-muted text-foreground/30"
              }`}
              aria-label={ouvert ? `Niveau ${n}` : `Niveau ${n}, fermé`}
            >
              {ouvert ? n : <Lock className="h-5 w-5" />}
              {ouvert && progres.etoiles?.[n] > 0 && <Etoiles n={progres.etoiles[n]} taille="h-2.5 w-2.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Vehicule({ v, cote, couleur, enMain, sortie, onDown }) {
  const pas = cote + ECART;
  const w = v.h ? v.l * cote + (v.l - 1) * ECART : cote;
  const h = v.h ? cote : v.l * cote + (v.l - 1) * ECART;
  const x = v.c * pas + (sortie ? 3 * pas : 0);
  return (
    <div
      data-vehicule={v.id}
      onPointerDown={(e) => onDown(e, v)}
      className={`absolute left-0 top-0 touch-none rounded-[14px] p-[3px] ${enMain ? "z-20" : "z-10"} ${
        enMain ? "" : sortie ? "transition-transform duration-500 ease-in" : "transition-transform duration-150 ease-out"
      } ${sortie ? "" : "cursor-grab active:cursor-grabbing"}`}
      style={{
        width: w,
        height: h,
        transform: `translate3d(${x}px, ${v.r * pas}px, 0)`,
        backgroundColor: couleur,
        boxShadow: enMain ? "0 8px 18px rgba(0,0,0,.45), inset 0 -4px 0 rgba(0,0,0,.2)" : "inset 0 -4px 0 rgba(0,0,0,.2)",
      }}
      aria-label={v.rouge ? "Voiture rouge" : v.l === 3 ? "Camion" : "Voiture"}
    >
      {/* Vitres : pare-brise à l'avant (droite ou bas) et lunette arrière. */}
      <span className={`absolute rounded-[6px] bg-white/55 ${v.h ? "inset-y-[22%] right-[14%] w-[16%]" : "inset-x-[22%] bottom-[14%] h-[16%]"}`} />
      <span className={`absolute rounded-[6px] bg-white/35 ${v.h ? "inset-y-[26%] left-[12%] w-[12%]" : "inset-x-[26%] top-[12%] h-[12%]"}`} />
      {v.rouge && <span className="absolute inset-0 grid place-items-center text-lg" aria-hidden="true">⭐</span>}
    </div>
  );
}

export default function Voiture({ profil = null }) {
  const progres = { niveau: 1, etoiles: {}, ...(profil?.progres?.voiture || {}) };
  const [niveau, setNiveau] = useState(null);
  const [vehicules, setVehicules] = useState([]);
  const [coups, setCoups] = useState(0);
  const [fini, setFini] = useState(false);
  const [sortie, setSortie] = useState(false);
  const [enMain, setEnMain] = useState(null);
  const [cote, setCote] = useState(0);
  const [, setVersion] = useState(0); // redessine le choix des niveaux après un progrès
  const plateauRef = useRef(null);
  const prise = useRef(null);
  const noeuds = useRef(new Map());

  useBackHandler(niveau !== null, () => setNiveau(null));

  useEffect(() => {
    const el = plateauRef.current;
    if (!el) return undefined;
    const mesurer = () => setCote((el.clientWidth - ECART * (TAILLE - 1)) / TAILLE);
    mesurer();
    const obs = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurer) : null;
    obs?.observe(el);
    return () => obs?.disconnect();
  }, [niveau]);

  const commencer = (n) => {
    setNiveau(n);
    setVehicules(lireNiveau(NIVEAUX[n - 1]));
    setCoups(0);
    setFini(false);
    setSortie(false);
    setEnMain(null);
  };

  const gagner = (nbCoups) => {
    const nb = etoiles(nbCoups, NIVEAUX[niveau - 1].coups);
    setSortie(true);
    jouerSon("victoire");
    setTimeout(() => {
      setFini(nb);
      confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ["#FF5A5F", "#FFB400", "#3EC28F", "#4A90E2"] });
    }, 550);
    if (profil) {
      enregistrerScore("voiture", { niveau, etoiles: nb, pseudo: profil.pseudo, avatar: profil.avatar });
      enregistrerProgres(profil, "voiture", progresApres(profil.progres?.voiture, niveau, nb, NIVEAUX.length)).then(() => setVersion((x) => x + 1));
    }
  };

  // ── Glisser une voiture (suit le doigt, s'arrête contre les autres et le bord) ──
  const pas = cote + ECART;
  const base = (v) => `translate3d(${v.c * pas}px, ${v.r * pas}px, 0)`;
  const surDown = (e, v) => {
    if (fini || sortie) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    noeuds.current.set(v.id, e.currentTarget);
    prise.current = { v, x0: e.clientX, y0: e.clientY, ...course(vehicules, v.id), decalage: 0 };
    setEnMain(v.id);
  };
  useEffect(() => {
    if (enMain === null) return undefined;
    const bouger = (e) => {
      const g = prise.current;
      if (!g) return;
      const brut = g.v.h ? e.clientX - g.x0 : e.clientY - g.y0;
      g.decalage = Math.max(g.min * pas, Math.min(g.max * pas, brut));
      const el = noeuds.current.get(g.v.id);
      if (el) el.style.transform = g.v.h
        ? `translate3d(${g.v.c * pas + g.decalage}px, ${g.v.r * pas}px, 0)`
        : `translate3d(${g.v.c * pas}px, ${g.v.r * pas + g.decalage}px, 0)`;
    };
    const lacher = () => {
      const g = prise.current;
      prise.current = null;
      setEnMain(null);
      if (!g) return;
      const nbCases = Math.round(g.decalage / pas);
      const el = noeuds.current.get(g.v.id);
      if (!nbCases) {
        if (el) el.style.transform = base(g.v);
        return;
      }
      const suivants = deplacer(vehicules, g.v.id, nbCases);
      const total = coups + 1;
      setVehicules(suivants);
      setCoups(total);
      jouerSon("pose");
      if (gagne(suivants)) gagner(total);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
    window.addEventListener("pointercancel", lacher);
    return () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
      window.removeEventListener("pointercancel", lacher);
    };
  });

  if (niveau === null) return <ChoixNiveau progres={progres} onChoisir={commencer} />;

  const minimum = NIVEAUX[niveau - 1].coups;
  const suivantOuvert = niveau < NIVEAUX.length;

  return (
    <div className="mx-auto max-w-md select-none">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => setNiveau(null)} aria-label="Niveaux" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-card ring-1 ring-border">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-1.5 text-center ring-1 ring-border">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground/50">Niveau</p>
          <p className="text-xl font-black">{niveau}</p>
        </div>
        <div className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-1.5 text-center ring-1 ring-border">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground/50">Coups</p>
          <motion.p key={coups} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }} className="text-xl font-black tabular-nums">
            {coups}<span className="text-sm font-bold text-foreground/40"> / {minimum}</span>
          </motion.p>
        </div>
        <button type="button" onClick={() => commencer(niveau)} aria-label="Recommencer" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-card ring-1 ring-border">
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      <div className="relative rounded-[1.5rem] bg-[#3a3f4b] p-2.5 pr-3.5 shadow-inner ring-4 ring-[#2a2e37]">
        {/* Sortie : ouverture dans le mur de droite, sur la 3e ligne. */}
        {cote > 0 && (
          <div
            className="absolute -right-1 z-0 flex items-center justify-end rounded-r-lg bg-[#FFB400] pr-0.5 text-sm font-black text-black"
            style={{ top: 10 + LIGNE_SORTIE * pas, height: cote, width: 22 }}
            aria-hidden="true"
          >
            ▶
          </div>
        )}
        <div ref={plateauRef} className="relative aspect-square w-full touch-none">
          {/* Cases du garage */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${TAILLE}, 1fr)`, gridTemplateRows: `repeat(${TAILLE}, 1fr)`, gap: ECART }}>
            {Array.from({ length: TAILLE * TAILLE }, (_, i) => (
              <span key={i} className={`rounded-[10px] ${Math.floor(i / TAILLE) === LIGNE_SORTIE ? "bg-[#4d5362]" : "bg-[#454a57]"}`} />
            ))}
          </div>
          {cote > 0 && vehicules.map((v) => (
            <Vehicule
              key={v.id}
              v={v}
              cote={cote}
              couleur={v.rouge ? "#FF3B3B" : COULEURS[(v.id - 1) % COULEURS.length]}
              enMain={enMain === v.id}
              sortie={sortie && v.rouge}
              onDown={surDown}
            />
          ))}
        </div>

        {fini && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[1.5rem] bg-background/92 p-5 text-center backdrop-blur-sm"
          >
            <p className="text-5xl" aria-hidden="true">🚗💨</p>
            <h2 className="mt-2 text-2xl font-black">La voiture est sortie !</h2>
            <div className="mt-2"><Etoiles n={fini} taille="h-8 w-8" /></div>
            <p className="mt-1 text-sm text-foreground/60">{coups} coup{coups > 1 ? "s" : ""}{fini < 3 ? ` · le moins possible : ${minimum}` : " · parfait !"}</p>
            <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
              {suivantOuvert && (
                <button type="button" onClick={() => commencer(niveau + 1)} className="min-h-12 rounded-full brand-gradient font-extrabold text-white">
                  Niveau suivant
                </button>
              )}
              <button type="button" onClick={() => commencer(niveau)} className="min-h-11 rounded-full border border-border font-bold">Rejouer</button>
              <button type="button" onClick={() => setNiveau(null)} className="min-h-11 rounded-full font-bold text-foreground/70">Tous les niveaux</button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
