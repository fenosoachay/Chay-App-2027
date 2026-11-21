import React, { useCallback, useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock3,
  Heart,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import useGameLogic from "@/hooks/useGameLogic";
import { enregistrerScore } from "@/lib/scoreBoard";

const gold = "#F6C453";

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/75 transition hover:border-white/25 hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" /> Retour aux jeux
    </button>
  );
}

export default function EmojisGame() {
  const navigate = useNavigate();
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState("");
  const game = useGameLogic(questions, timerEnabled);
  const correct = game.selectedAnswer === game.question?.answer;
  const questionFinished = game.selectedAnswer !== null;

  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    setLoadError("");
    try {
      const all = [];
      let cursor;
      do {
        const page = await base44.entities.EmojiQuizQuestion.filter(
          {},
          { sort: "created_date", limit: 200, cursor }
        );
        all.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      setQuestions(all);
    } catch (error) {
      setLoadError(error?.message || "Impossible de charger les énigmes.");
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (game.status !== "playing" || !questionFinished || !correct) return;
    confetti({
      particleCount: 65,
      spread: 65,
      origin: { y: 0.65 },
      colors: [gold, "#FFF1C2", "#E7A936", "#FFFFFF"],
    });
  }, [correct, game.status, questionFinished]);

  // Leaderboard (1.3.22) : le score de la partie, une fois à la fin.
  useEffect(() => {
    if (game.status === "finished" && game.score > 0) enregistrerScore("emoji", { score: game.score });
  }, [game.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => navigate("/games");
  const fontFamily = "'Aglio Picasso', var(--font-display), sans-serif";

  return (
    <main
      className="relative isolate min-h-[calc(100dvh-5rem)] overflow-hidden bg-[#101014] px-4 py-6 text-white sm:px-6 sm:py-10"
      style={{ fontFamily }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-amber-400/10 blur-[100px]" />
        <div className="absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-[100px]" />
        <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-rose-500/10 blur-[110px]" />
      </div>

      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <BackButton onClick={goBack} />
          {game.status === "playing" && (
            <div className="flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 font-extrabold text-amber-200">
              <Trophy className="h-4 w-4" /> {game.score} pts
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {game.status === "ready" && loadingQuestions && (
            <motion.section
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-10 text-center"
            >
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-200" />
              <p className="mt-4 text-sm font-semibold text-white/65">Chargement des énigmes…</p>
            </motion.section>
          )}

          {game.status === "ready" && !loadingQuestions && questions.length === 0 && (
            <motion.section
              key="empty"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center sm:p-10"
            >
              <p className="text-4xl">🧩</p>
              <h1 className="mt-4 text-3xl font-black">{loadError ? "Jeu indisponible" : "Le jeu se prépare"}</h1>
              <p className="mt-3 text-white/65">
                {loadError || "Un administrateur doit charger les énigmes de départ dans le panneau d’administration."}
              </p>
              {loadError ? (
                <button type="button" onClick={loadQuestions} className="mt-6 rounded-full bg-white px-6 py-3 font-black text-[#17151a]">
                  Réessayer
                </button>
              ) : (
                <button type="button" onClick={() => navigate("/admin/emojis")} className="mt-6 rounded-full bg-white px-6 py-3 font-black text-[#17151a]">
                  Ouvrir la gestion du jeu
                </button>
              )}
            </motion.section>
          )}

          {game.status === "ready" && !loadingQuestions && questions.length > 0 && (
            <motion.section
              key="welcome"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 text-center shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10"
            >
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-amber-200/20 bg-amber-300/10 text-5xl shadow-[0_0_45px_rgba(246,196,83,0.12)]">
                ✨
              </div>
              <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-amber-200">Jeu biblique</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Devine qui je suis</h1>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                Observe les émojis, devine le personnage biblique et gagne 10 points à chaque bonne réponse.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm font-bold text-white/75">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2"><Heart className="h-4 w-4 fill-rose-400 text-rose-400" /> 3 vies</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2"><Lightbulb className="h-4 w-4 text-amber-300" /> Indices progressifs</span>
              </div>
              <label className="mx-auto mt-5 flex w-fit cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/75">
                <input
                  type="checkbox"
                  checked={timerEnabled}
                  onChange={(event) => setTimerEnabled(event.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
                <Clock3 className="h-4 w-4 text-amber-200" />
                Chronomètre de 30 secondes
              </label>
              <button
                type="button"
                onClick={game.start}
                className="mx-auto mt-7 flex min-h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-9 py-4 text-base font-black text-[#21190a] shadow-[0_8px_35px_rgba(246,196,83,0.22)] transition hover:scale-[1.03] hover:shadow-[0_8px_42px_rgba(246,196,83,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
              >
                <Sparkles className="h-5 w-5" /> Jouer
              </button>
            </motion.section>
          )}

          {game.status === "playing" && game.question && (
            <motion.section
              key={`question-${game.questionIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={questionFinished && !correct ? { x: [0, -9, 9, -7, 7, 0], opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: questionFinished && !correct ? 0.38 : 0.3 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-white/55">
                  Question {game.questionIndex + 1} / {game.totalQuestions}
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5" aria-label={`${game.lives} vies restantes`}>
                    {[0, 1, 2].map((life) => (
                      <Heart
                        key={life}
                        className={`h-5 w-5 ${life < game.lives ? "fill-rose-400 text-rose-400" : "text-white/20"}`}
                      />
                    ))}
                  </div>
                  {game.secondsLeft !== null && (
                    <span className={`inline-flex min-w-16 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-extrabold ${
                      game.secondsLeft <= 10
                        ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
                        : "border-white/10 bg-black/20 text-white/75"
                    }`}>
                      <Clock3 className="h-4 w-4" /> {game.secondsLeft}s
                    </span>
                  )}
                </div>
              </div>

              <div className="flex min-h-44 items-center justify-center rounded-3xl border border-amber-200/10 bg-gradient-to-br from-amber-300/[0.08] via-white/[0.025] to-violet-400/[0.07] px-3 py-7">
                <motion.div
                  aria-label={`Énigme : ${game.question.emojis}`}
                  className="text-center text-[4.5rem] leading-tight drop-shadow-[0_0_24px_rgba(246,196,83,0.24)] sm:text-[6rem]"
                  animate={{ y: [0, -7, 0], scale: [1, 1.035, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {game.question.emojis}
                </motion.div>
              </div>

              <p className="mt-5 text-center text-sm font-semibold text-white/45">
                Qui se cache derrière ces émojis ?
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {game.question.options.map((option) => {
                  const isCorrect = questionFinished && option === game.question.answer;
                  const isWrong = questionFinished && option === game.selectedAnswer && !correct;
                  return (
                    <motion.button
                      key={option}
                      type="button"
                      whileHover={!questionFinished ? { y: -2, scale: 1.01 } : undefined}
                      onClick={() => game.answer(option)}
                      disabled={questionFinished}
                      className={`min-h-14 rounded-2xl border px-5 py-3 text-left font-extrabold transition duration-200 ${
                        isCorrect
                          ? "border-amber-300 bg-amber-300/15 text-amber-100 shadow-[0_0_28px_rgba(246,196,83,0.16)]"
                          : isWrong
                            ? "border-rose-400 bg-rose-400/15 text-rose-200"
                            : questionFinished
                              ? "border-white/5 bg-white/[0.02] text-white/35"
                              : "border-white/10 bg-white/[0.035] text-white/85 hover:border-amber-200/50 hover:bg-amber-200/[0.07] hover:shadow-[0_0_24px_rgba(246,196,83,0.08)]"
                      }`}
                    >
                      {option}
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={game.revealHint}
                  disabled={questionFinished || game.hintsRevealed >= 2}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-200/20 px-4 py-2 text-sm font-extrabold text-amber-200 transition hover:border-amber-200/50 hover:bg-amber-200/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Lightbulb className="h-4 w-4" />
                  {game.hintsRevealed >= 2 ? "Indices utilisés" : "Indice · −1 point"}
                </button>
                {questionFinished && (
                  <button
                    type="button"
                    onClick={game.next}
                    className="min-h-11 rounded-full bg-white px-6 py-2.5 text-sm font-black text-[#17151a] transition hover:scale-[1.03]"
                  >
                    {game.gameOver ? "Voir le résultat" : "Question suivante"}
                  </button>
                )}
              </div>
              {game.hintText && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] px-4 py-3 text-sm font-semibold text-amber-100/90"
                >
                  {game.hintText}
                </motion.p>
              )}
              {questionFinished && (
                <p className={`mt-4 text-center text-sm font-extrabold ${correct ? "text-amber-200" : "text-rose-300"}`}>
                {correct ? "Bonne réponse ! +10 points" : game.timedOut ? "Temps écoulé !" : "Ce n’est pas ça !"}
                </p>
              )}
            </motion.section>
          )}

          {game.status === "finished" && (
            <motion.section
              key="results"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-[2rem] border border-amber-200/15 bg-white/[0.045] p-7 text-center shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10"
            >
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-amber-200/20 bg-amber-300/10">
                <Trophy className="h-10 w-10 text-amber-200" />
              </div>
              <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-amber-200">
                {game.gameOver ? "Partie terminée" : "Fin de la partie"}
              </p>
              <h1 className="mt-3 text-5xl font-black sm:text-7xl">{game.score} <span className="text-2xl text-amber-200">pts</span></h1>
              <p className="mt-4 text-white/65">
                {game.correctCount} bonne(s) réponse(s) sur {game.totalQuestions}
                {game.gameOver ? " · Il ne te restait plus de vie." : ""}
              </p>
              <button
                type="button"
                onClick={game.start}
                className="mx-auto mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-7 py-3 font-black text-[#21190a] shadow-[0_8px_35px_rgba(246,196,83,0.2)] transition hover:scale-[1.03]"
              >
                <RefreshCw className="h-4 w-4" /> Rejouer
              </button>
            </motion.section>
          )}
        </AnimatePresence>

        {game.status === "playing" && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-4 sm:p-5"
          >
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-white/75">
              <Check className="h-4 w-4 text-emerald-300" />
              Personnages trouvés
              <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-xs text-emerald-200">
                {game.foundAnswers.length}
              </span>
            </h2>
            {game.foundAnswers.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {game.foundAnswers.map((answer) => (
                  <li
                    key={answer}
                    className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-sm font-bold text-emerald-100"
                  >
                    {answer}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/45">Les bonnes réponses apparaîtront ici.</p>
            )}
          </motion.section>
        )}
      </div>
    </main>
  );
}
