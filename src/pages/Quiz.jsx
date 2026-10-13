import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import QuizOfflineScreen from "@/components/quiz/QuizOfflineScreen";
import { QUIZ_LEVELS } from "@/lib/quizConstants";

export default function Quiz() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [levels, setLevels] = useState(null);

  useEffect(() => {
    if (!online) return;
    base44.functions.invoke("quizLevels", {}).then((r) => setLevels(r.data.levels));
  }, [online]);

  if (!online) return <QuizOfflineScreen />;
  if (!levels) return <div className="py-24 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-8 md:py-12">
      <h1 className="display-fluid mb-6">Quiz <span className="brand-gradient-text">biblique</span></h1>
      <div className="grid gap-4">
        {QUIZ_LEVELS.map((l) => {
          const info = levels[l.value];
          return (
            <div key={l.value} className={`rounded-[1.5rem] border p-5 ${l.badge}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display font-extrabold text-xl text-foreground">{l.emoji} {l.label}</div>
                  <div className="text-sm text-foreground/60">{info.question_count} questions · meilleur score {info.best_score_percent} %</div>
                </div>
                {info.unlocked ? (
                  <button onClick={() => navigate(`/quiz/play/${l.value}`)} className="rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground">Jouer</button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground/60">
                    <Lock className="h-4 w-4" /> Terminez le niveau précédent avec {info.threshold}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}