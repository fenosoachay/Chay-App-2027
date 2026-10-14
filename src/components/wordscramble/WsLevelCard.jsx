import React from "react";
import { Lock } from "lucide-react";
import ProgressRing from "@/components/ProgressRing";
import { wsLevelLabel } from "@/lib/wordScrambleConstants";

export default function WsLevelCard({ level, info, onPlay }) {
  const locked = !info.unlocked;
  return (
    <div className={`rounded-[1.5rem] border p-5 ${level.ring} ${locked ? "opacity-80" : ""}`}>
      <div className="flex items-center gap-4">
        <ProgressRing progress={(info.best_percent || 0) / 100} size={84} stroke={8}>
          {locked ? (
            <Lock className="h-6 w-6 text-foreground/60" />
          ) : (
            <span className="font-display font-extrabold text-lg">{info.best_percent || 0}%</span>
          )}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className={`font-display font-extrabold text-xl ${level.color}`}>{level.emoji} {level.label}</div>
          <div className="text-sm text-foreground/60">
            {info.words_per_game} mots par partie · meilleur score {info.best_score || 0} pts
          </div>
          {locked && (
            <div className="mt-1 text-xs font-bold text-foreground/60">
              🔒 Réussir {wsLevelLabel(info.requires)} à {info.threshold}% pour débloquer
            </div>
          )}
        </div>
        {!locked && (
          <button onClick={onPlay} className="rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground transition hover:scale-105">
            Jouer
          </button>
        )}
      </div>
    </div>
  );
}