import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";

export default function QuizResults() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const summary = state?.summary;
  if (!summary) return <Navigate to="/quiz" replace />;

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <Trophy className="mx-auto mb-4 h-14 w-14 text-yellow-500" />
      <h2 className="font-display font-extrabold text-4xl">{summary.correct}/{summary.total} - {summary.score_percent}%</h2>
      <div className="mt-8 flex flex-col gap-3">
        <button onClick={() => navigate(`/quiz/play/${summary.difficulty}`)} className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Rejouer</button>
        <button onClick={() => navigate("/quiz")} className="rounded-full border border-border px-6 py-3 font-bold">Retour au menu</button>
      </div>
    </div>
  );
}