import React, { useEffect, useState } from "react";
import { ArrowRight, Brain } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Carte « Quiz biblique » du tableau de bord : questions, joueurs actifs, score moyen.
export default function QuizStatCard({ onClick }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    base44.functions.invoke("quizAdminStats", {}).then((r) => setStats(r.data)).catch(() => setStats({}));
  }, []);

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-[1.5rem] border border-border bg-card p-5 hover:-translate-y-1 hover:shadow-lg transition-all"
    >
      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#8A56E2] to-[#FF57B2] grid place-items-center text-white shadow-sm mb-3">
        <Brain className="h-6 w-6" />
      </div>
      <div className="font-display font-extrabold text-3xl tabular-nums">{stats ? stats.total_questions ?? 0 : "…"}</div>
      <div className="text-sm font-semibold text-foreground/55 flex items-center gap-1 mt-0.5">
        Quiz biblique
        <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="mt-2 text-xs text-foreground/60">
        {stats ? `${stats.players ?? 0} joueurs actifs · score moyen ${stats.average_score_percent ?? 0} %` : "Chargement…"}
      </div>
    </button>
  );
}