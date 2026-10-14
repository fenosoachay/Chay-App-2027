import React, { useEffect, useState } from "react";
import { Loader2, Type, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { WS_LEVELS } from "@/lib/wordScrambleConstants";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground/60"><Icon className="h-4 w-4 text-primary" /> {label}</div>
      <div className="mt-1 font-display font-extrabold text-3xl">{value}</div>
    </div>
  );
}

function Ranking({ title, rows }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 text-xs font-bold text-foreground/60">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-foreground/50">Pas encore de données.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between"><span className="font-bold">{i + 1}. {r.word}</span><span className="text-foreground/60">{r.count} fois</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function WsStats({ refreshKey }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    base44.functions.invoke("wsAdminStats", {}).then((r) => setStats(r.data));
  }, [refreshKey]);

  if (!stats) return <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat icon={Type} label="Mots au total" value={stats.total_words} />
        <Stat icon={Users} label="Joueurs actifs" value={stats.players} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {WS_LEVELS.map((l) => (
          <div key={l.value} className={`rounded-2xl border p-3 text-center ${l.badge}`}>
            <div className="text-xs font-bold">{l.emoji} {l.label}</div>
            <div className="font-display font-extrabold text-2xl text-foreground">{stats.per_level[l.value] ?? 0}</div>
            <div className="text-2xs text-foreground/60">mots · score moyen {stats.average_by_level[l.value] ?? 0}%</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Ranking title="Mots les plus réussis" rows={stats.most_solved || []} />
        <Ranking title="Mots les moins réussis" rows={stats.least_solved || []} />
      </div>
    </div>
  );
}