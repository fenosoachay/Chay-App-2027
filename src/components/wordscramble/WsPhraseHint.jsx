import React from "react";
import { Lightbulb } from "lucide-react";

export default function WsPhraseHint({ phrase }) {
  if (!phrase) return null;
  return (
    <div className="animate-float-in rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        <div>
          <p className="font-semibold">{phrase.hint}</p>
          {phrase.reference && <p className="mt-0.5 text-xs text-foreground/60">{phrase.reference}</p>}
        </div>
      </div>
    </div>
  );
}