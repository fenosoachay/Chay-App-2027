import React from "react";
import { Timer } from "lucide-react";

export default function QuizTimer({ seconds, total }) {
  const low = seconds <= 5;
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${low ? "text-destructive" : "text-foreground/70"}`}>
        <Timer className="h-4 w-4" /> {seconds}s
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${low ? "bg-destructive" : "brand-gradient"}`}
          style={{ width: `${(seconds / total) * 100}%` }}
        />
      </div>
    </div>
  );
}