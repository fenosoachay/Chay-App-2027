import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Gamepad2, Trophy, Flame, Check, X, RefreshCw, ArrowRight } from "lucide-react";
import { hasNavigationOrigin } from "@/lib/backNavigation";

const GAMES = [
  { id: "trivia", name: "Quiz biblique", desc: "Testez vos connaissances", tone: "from-[#4A6CFE] to-[#8A56E2]", live: true },
  { id: "emoji", name: "Émojis bibliques", desc: "Devinez à partir des émojis", tone: "from-[#8A56E2] to-[#FF57B2]", live: false },
  { id: "scramble", name: "Mots mélangés", desc: "Reconstituez les noms", tone: "from-[#FF57B2] to-[#FF4D2D]", live: true, path: "/word-scramble" },
  { id: "puzzle", name: "Puzzle biblique", desc: "Reconstituez l'image", tone: "from-[#2E6F40] to-[#4A6CFE]", live: false },
  { id: "detective", name: "Enquête biblique", desc: "Résolvez l'énigme", tone: "from-[#FF4D2D] to-[#8A56E2]", live: false },
];

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
        <h1 className="display-fluid">Jeux <span className="brand-gradient-text">bibliques</span></h1>
        <p className="mt-3 text-lg text-foreground/60">Découvrez la Parole en vous amusant.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {GAMES.map((g) => (
          <div key={g.id} className="group rounded-[1.5rem] border border-border bg-card p-6 hover:-translate-y-1 hover:shadow-lg transition-all">
            <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${g.tone} grid place-items-center text-white shadow-sm mb-4`}>
              <Gamepad2 className="h-7 w-7" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display font-bold text-xl">{g.name}</h3>
              {g.live && <span className="rounded-full bg-secondary/10 text-secondary text-xs font-bold px-2 py-0.5">Disponible</span>}
            </div>
            <p className="text-sm text-foreground/55">{g.desc}</p>
            {g.live ? (
              <button onClick={() => navigate(g.path || "/quiz")} className="mt-5 w-full rounded-full bg-primary text-primary-foreground px-5 py-3 font-bold hover:scale-[1.02] transition">
                Jouer
              </button>
            ) : (
              <button disabled className="mt-5 w-full rounded-full border border-border text-foreground/40 px-5 py-3 font-bold cursor-not-allowed">
                Bientôt disponible
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}