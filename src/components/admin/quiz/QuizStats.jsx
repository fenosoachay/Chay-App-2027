import React, { useEffect, useState } from "react";
import { Loader2, HelpCircle, Users, Target } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { QUIZ_LEVELS } from "@/lib/quizConstants";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground/60">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <div className="mt-1 font-display font-extrabold text-3xl">{value}</div>
    </div>
  );
}

export default function QuizStats({ refreshKey }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    base44.functions.invoke("quizAdminStats", {}).then((r) => setStats(r.data));
  }, [refreshKey]);

  if (!stats) {
    return <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat icon={HelpCircle} label="Questions au total" value={stats.total_questions} />
        <Stat icon={Users} label="Joueurs" value={stats.players} />
        <Stat icon={Target} label="Score moyen" value={`${stats.average_score_percent} %`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {QUIZ_LEVELS.map((l) => (
          <div key={l.value} className={`rounded-2xl border p-3 text-center ${l.badge}`}>
            <div className="text-xs font-bold">{l.emoji} {l.label}</div>
            <div className="font-display font-extrabold text-2xl text-foreground">{stats.per_level[l.value] ?? 0}</div>
            <div className="text-2xs text-foreground/60">questions</div>
          </div>
        ))}
      </div>
    </div>
  );
}