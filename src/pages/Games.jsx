import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  Blocks,
  Hash,
  KeyRound,
  Signpost,
  Target,
  Check,
  Flame,
  Gamepad2,
  Puzzle,
  RefreshCw,
  Shuffle,
  Smile,
  Trophy,
  X,
} from "lucide-react";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { JEUX, grouperJeux } from "@/lib/jeuxCategories";
import ScoreBoard from "@/components/jeux/ScoreBoard";
import BoutonSon from "@/components/BoutonSon";
import EauxProfondes from "@/components/jeux/EauxProfondes";
import BarreJeux, { PhraseBrillante, TEINTES } from "@/components/jeux/BarreJeux";

// Apparence de chaque jeu (identifiants : src/lib/jeuxCategories.js).
const APPARENCE = {
  trivia: { icon: Brain, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  brique: { icon: Blocks, tone: "from-[#44916F] to-[#4A6CFE]" },
  emoji: { icon: Smile, tone: "from-[#8A56E2] to-[#FF57B2]" },
  scramble: { icon: Shuffle, tone: "from-[#FF57B2] to-[#FF4D2D]" },
  puzzle: { icon: Puzzle, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  motscroises: { icon: Hash, tone: "from-[#C18B33] to-[#A84D70]" },
  enigmes: { icon: KeyRound, tone: "from-[#3EC28F] to-[#4A6CFE]" },
  ouvastu: { icon: Signpost, tone: "from-[#FF8A3D] to-[#FF4D2D]" },
  fronde: { icon: Target, tone: "from-[#7cc6ff] to-[#4A6CFE]" },
};
const GAMES = JEUX.map((j) => ({ ...j, ...APPARENCE[j.id], live: true }));

// 1.3.34 : phrase d'accueil de chaque catégorie, sous sa barre.
const PHRASES = {
  game: "Bienvenue dans les eaux profondes où les hommes intelligents puisent leur dessein !",
  playmobile: "Détendez-vous maintenant.",
};

function GrilleJeux({ jeux, onOpen }) {
  return (
    <div className="mx-auto grid max-w-5xl grid-cols-2 place-items-center gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-5">
      {jeux.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onOpen(g.path || "/quiz")}
          aria-label={`Ouvrir le jeu ${g.name}`}
          title={g.name}
          className={`group flex aspect-square w-full max-w-32 flex-col items-center justify-center gap-2 rounded-full bg-gradient-to-br ${g.tone} p-3 text-center text-white shadow-md transition-all hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
        >
          <g.icon className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-hidden="true" />
          <span className="max-w-full break-words text-base font-bold leading-tight sm:text-lg">
            {g.name}
          </span>
        </button>
      ))}
    </div>
  );
}

const QUESTIONS = [
  { q: "Qui a construit l'arche pour survivre au déluge ?", options: ["Moïse", "Noé", "Abraham", "David"], answer: 1, explain: "Noé a construit l'arche sur l'ordre de Dieu (Genèse 6)." },
  { q: "Combien de jours Jésus a-t-il jeûné dans le désert ?", options: ["7", "20", "40", "100"], answer: 2, explain: "Jésus a jeûné quarante jours et quarante nuits (Matthieu 4:2)." },
  { q: "Qui a conduit les Israélites hors d'Égypte ?", options: ["Moïse", "Josué", "Aaron", "Samuel"], answer: 0, explain: "Moïse a conduit le peuple hors d'Égypte (Exode 12)." },
  { q: "Quel est le premier livre de la Bible ?", options: ["Exode", "Psaumes", "Genèse", "Matthieu"], answer: 2, explain: "La Genèse est le premier livre de la Bible." },
  { q: "Qui a renié Jésus trois fois ?", options: ["Jean", "Pierre", "Judas", "Jacques"], answer: 1, explain: "Pierre a renié Jésus trois fois avant le chant du coq (Luc 22)." },
];

export default function Games() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const active = searchParams.get("game");
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Catégories et classements : null = chargement ; collections absentes (avant la migration) = tous les jeux.
  const [classement, setClassement] = useState(null);
  const [voirClassement, setVoirClassement] = useState(false);
  useEffect(() => {
    let actif = true;
    Promise.all([
      base44.entities.GameCategory.list("order", 10),
      base44.entities.GameClassement.list("-created_date", 500),
    ])
      .then(([cats, cls]) => { if (actif) setClassement(grouperJeux(cats, cls, GAMES)); })
      .catch(() => { if (actif) setClassement({ sections: [{ slot: "tous", name: "", jeux: GAMES }], nonClasses: [] }); });
    return () => { actif = false; };
  }, []);

  const startTrivia = () => {
    setSearchParams(
      { game: "trivia" },
      { replace: active === "trivia", state: { chayGameStarted: true } }
    );
    setQIdx(0); setPicked(null); setScore(0); setStreak(0); setDone(false);
  };

  const pick = (i) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === QUESTIONS[qIdx].answer) {
      setScore((s) => s + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
  };

  const next = () => {
    if (qIdx + 1 < QUESTIONS.length) {
      setQIdx((i) => i + 1);
      setPicked(null);
    } else {
      setDone(true);
    }
  };

  if (active === "trivia") {
    const q = QUESTIONS[qIdx];
    return (
      <div className="mx-auto max-w-2xl px-6 md:px-8 py-8 md:py-12">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => {
              if (hasNavigationOrigin(window.history.state, "chayGameStarted"))
                navigate(-1);
              else setSearchParams({}, { replace: true });
            }}
            className="text-sm font-bold text-foreground/60 hover:text-foreground"
          >
            ← Retour
          </button>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold"><Trophy className="h-4 w-4 text-primary" /> {score}/{QUESTIONS.length}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold"><Flame className="h-4 w-4 text-primary" /> {streak}</span>
          </div>
        </div>

        {!done ? (
          <div className="rounded-[2rem] border border-border bg-card p-8 md:p-10">
            <div className="text-xs font-bold text-primary uppercase tracking-wide mb-3">Question {qIdx + 1} sur {QUESTIONS.length}</div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl leading-snug">{q.q}</h2>
            <div className="mt-6 grid gap-3">
              {q.options.map((opt, i) => {
                const isAnswer = i === q.answer;
                const isPicked = picked === i;
                let cls = "border-border bg-background hover:border-primary";
                if (picked !== null) {
                  if (isAnswer) cls = "border-secondary bg-secondary/10 text-secondary";
                  else if (isPicked) cls = "border-destructive bg-destructive/10 text-destructive";
                  else cls = "border-border bg-background opacity-60";
                }
                return (
                  <button
                    key={i}
                    onClick={() => pick(i)}
                    disabled={picked !== null}
                    className={`flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left font-bold transition ${cls}`}
                  >
                    {opt}
                    {picked !== null && isAnswer && <Check className="h-5 w-5" />}
                    {picked !== null && isPicked && !isAnswer && <X className="h-5 w-5" />}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-5 rounded-2xl bg-background border border-border p-4">
                <div className="text-sm font-semibold text-foreground/60 mb-1">Explication</div>
                <p className="text-foreground/85">{q.explain}</p>
                <button onClick={next} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-bold hover:scale-105 transition">
                  {qIdx + 1 < QUESTIONS.length ? "Question suivante" : "Voir les résultats"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[2rem] brand-gradient p-10 text-white text-center glow-primary">
            <Trophy className="h-16 w-16 mx-auto mb-4" />
            <h2 className="font-display font-extrabold text-4xl">{score}/{QUESTIONS.length}</h2>
            <p className="text-white/80 mt-2">Votre score : {Math.round((score / QUESTIONS.length) * 100)} %. Bravo !</p>
            <button onClick={startTrivia} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white text-foreground px-7 py-3 font-bold hover:scale-105 transition">
              <RefreshCw className="h-4 w-4" /> Rejouer
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 md:px-8 py-8 md:py-12">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="display-fluid">Jeux <span className="brand-gradient-text">bibliques</span></h1>
          <BoutonSon className="mt-2" />
        </div>
      </header>

      {classement === null ? (
        <div className="h-32" aria-busy="true" />
      ) : (
        <div className="space-y-4">
          {/* 1.3.34 : 1. Leaderboard (replié : on le touche pour voir le classement) ; 2. Chay Game ;
              3. Chay PlayMobile. Les jeux flottent en bulles dans les eaux profondes. */}
          <div className="mx-auto max-w-3xl">
            <BarreJeux titre="Leaderboard" icone={Trophy} teinte={TEINTES.classement} ordre={0} ouvert={voirClassement} onClick={() => setVoirClassement((v) => !v)} />
            <AnimatePresence initial={false}>
              {voirClassement && (
                <motion.div
                  key="classement"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3"><ScoreBoard espace="adulte" /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {classement.sections.filter((c) => c.slot !== "tous" || c.jeux.length).map((c, i) => (
            <section key={c.slot} aria-label={c.name || "Jeux"} className="mx-auto max-w-3xl space-y-3 pt-4">
              <BarreJeux titre={c.name || "Jeux"} icone={c.slot === "playmobile" ? Target : Gamepad2} teinte={TEINTES[c.slot] || TEINTES.game} ordre={i + 1} />
              {PHRASES[c.slot] && <PhraseBrillante texte={PHRASES[c.slot]} ordre={i + 1} />}
              <EauxProfondes jeux={c.jeux} onOpen={navigate} slot={c.slot === "playmobile" ? "playmobile" : "game"} />
            </section>
          ))}
          {/* Jeux pas encore classés : jamais montrés aux membres ; les admins les voient pour les tester. */}
          {isAdmin && classement.nonClasses.length > 0 && (
            <section aria-label="Jeux à classer" className="rounded-[1.5rem] border border-dashed border-amber-500/50 p-5">
              <h2 className="mb-1 font-display text-lg font-extrabold">À classer (visible des admins seulement)</h2>
              <p className="mb-5 text-sm text-foreground/60">Panneau admin › Jeux › Catégories des jeux.</p>
              <GrilleJeux jeux={classement.nonClasses} onOpen={navigate} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
