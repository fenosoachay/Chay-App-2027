import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import WsResultDetails from "@/components/wordscramble/WsResultDetails";
import { resultMessage, wsLevelLabel } from "@/lib/wordScrambleConstants";

// Compte animé de 0 jusqu'au score final.
function useCountUp(target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 1000);
      setValue(Math.round(target * p));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export default function WordScrambleResults() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const summary = state?.summary;
  const shown = useCountUp(summary?.total_score || 0);

  const perfect = Boolean(summary) && summary.score_percent >= 100 && summary.perfect;
  useEffect(() => {
    if (perfect) {
      import("canvas-confetti").then(({ default: confetti }) =>
        confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 } })
      );
    }
  }, [perfect]);

  if (!summary) return <Navigate to="/word-scramble" replace />;

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <Trophy className="mx-auto mb-3 h-14 w-14 text-yellow-500" />
      <h2 className="font-display font-extrabold text-5xl tabular-nums">{shown} <span className="text-2xl">points</span></h2>
      <p className="mt-1 text-sm text-foreground/60">{summary.score_percent}% du maximum ({summary.max_score} pts)</p>
      <p className="mt-4 font-display font-extrabold text-xl">{resultMessage(summary)}</p>
      <p className="mt-2 text-sm font-bold">+{summary.credits_earned} 💎 <span className="text-foreground/50">(total {summary.credits})</span></p>
      {summary.newly_unlocked && (
        <p className="mt-2 text-sm font-bold text-green-500">🔓 Niveau {wsLevelLabel(summary.newly_unlocked)} débloqué !</p>
      )}

      <div className="mt-6"><WsResultDetails details={summary.details} abandoned={state?.abandoned} /></div>

      <div className="mt-8 flex flex-col gap-3">
        <button onClick={() => navigate(`/word-scramble/play/${summary.difficulty}`)} className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">🔄 Rejouer</button>
        {summary.next_level && summary.next_level_unlocked && (
          <button onClick={() => navigate(`/word-scramble/play/${summary.next_level}`)} className="rounded-full border border-primary px-6 py-3 font-bold text-primary">➡️ Niveau suivant</button>
        )}
        <button onClick={() => navigate("/word-scramble")} className="rounded-full border border-border px-6 py-3 font-bold">🏠 Retour au menu</button>
      </div>
    </div>
  );
}