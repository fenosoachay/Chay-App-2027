import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Trophy, WifiOff } from "lucide-react";
import useQuizGame, { QUESTION_SECONDS } from "@/hooks/useQuizGame";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import QuizOfflineScreen from "@/components/quiz/QuizOfflineScreen";
import QuizTimer from "@/components/quiz/QuizTimer";
import QuizAnswerButton from "@/components/quiz/QuizAnswerButton";
import { levelOf } from "@/lib/quizConstants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LETTERS = ["A", "B", "C", "D"];

function buttonState(letter, result) {
  if (!result) return "idle";
  if (letter === result.correct_answer) return "correct";
  if (letter === result.chosen) return "wrong";
  return "dimmed";
}

function PlayView({ difficulty }) {
  const navigate = useNavigate();
  const game = useQuizGame(difficulty);
  const online = useOnlineStatus();
  const level = levelOf(difficulty);
  const { status, question, index, total, result, score, seconds, checking, summary, session } = game;

  useEffect(() => {
    if (status === "finished") navigate("/quiz/results", { replace: true, state: { summary } });
  }, [status, summary, navigate]);

  if (!online && status === "loading") return <QuizOfflineScreen />;
  if (status === "loading") {
    return <div className="py-24 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (status === "error") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-foreground/70">{game.error}</p>
        <button onClick={() => navigate("/quiz")} className="mt-5 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">
          Retour au menu
        </button>
      </div>
    );
  }
  if (status === "finished") return null;

  const progress = ((index + (result ? 1 : 0)) / total) * 100;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-6 md:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={() => navigate("/quiz")} className="text-sm font-bold text-foreground/60 hover:text-foreground">
          ← Retour
        </button>
        <span className="text-sm font-bold text-foreground/70">Question {index + 1} sur {total}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold">
          <Trophy className="h-4 w-4 text-yellow-500" /> {score}/{total}
        </span>
      </div>

      {session.limited && (
        <p className="mb-3 text-center text-xs text-foreground/50">Nouveau contenu en cours d'ajout par l'administration.</p>
      )}

      <div key={question.id} className="animate-float-in rounded-[2rem] border border-border bg-card p-6 md:p-8">
        <QuizTimer seconds={seconds} total={QUESTION_SECONDS} />
        {level && (
          <span className={`mt-4 inline-block rounded-full border px-3 py-1 text-xs font-bold ${level.badge}`}>
            {level.emoji} {level.label}
          </span>
        )}
        <h2 className="mt-3 font-display font-extrabold text-2xl md:text-3xl leading-snug">{question.question}</h2>

        <div className="mt-6 grid gap-3">
          {LETTERS.map((l) => (
            <QuizAnswerButton
              key={l}
              letter={l}
              text={question.options[l]}
              state={buttonState(l, result)}
              disabled={Boolean(result) || checking}
              onClick={() => game.answer(l)}
            />
          ))}
        </div>

        {result && (
          <div className={`mt-5 rounded-2xl border p-4 ${result.is_correct ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
            <div className="font-display font-extrabold text-lg">
              {result.is_correct ? "✅ Correct !" : result.chosen ? "❌ Incorrect" : "⏱️ Temps écoulé"}
            </div>
            {result.explanation && <p className="mt-1 text-foreground/80">{result.explanation}</p>}
            <button
              onClick={game.next}
              disabled={checking}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:scale-105 disabled:opacity-60"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {index + 1 < total ? "Question suivante" : "Voir les résultats"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full brand-gradient transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <AlertDialog open={!online}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><WifiOff className="h-5 w-5 text-destructive" /> Connexion perdue</AlertDialogTitle>
            <AlertDialogDescription>La partie est annulée.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => navigate("/quiz")}>Retour au menu</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function QuizPlay() {
  const { difficulty } = useParams();
  const navigate = useNavigate();
  const valid = Boolean(levelOf(difficulty));

  useEffect(() => {
    if (!valid) navigate("/quiz", { replace: true });
  }, [valid, navigate]);

  if (!valid) return null;
  return <PlayView key={difficulty} difficulty={difficulty} />;
}