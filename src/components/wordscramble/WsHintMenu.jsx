import React, { useState } from "react";
import { Lightbulb, ChevronDown } from "lucide-react";
import { WS_HINT_COSTS } from "@/lib/wordScrambleConstants";

export default function WsHintMenu({ disabled, credits, onPick }) {
  const [open, setOpen] = useState(false);
  const pick = (type) => {
    setOpen(false);
    onPick(type);
  };
  const item = (type, label) => {
    const cost = WS_HINT_COSTS[type];
    return (
      <button
        onClick={() => pick(type)}
        disabled={credits < cost}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-bold hover:bg-muted disabled:opacity-40"
      >
        {label}
        <span className="text-xs text-foreground/60">{cost} 💎</span>
      </button>
    );
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
      >
        <Lightbulb className="h-4 w-4 text-yellow-500" /> Indice <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          {item("first_letter", "Révéler la première lettre")}
          {item("phrase", "Phrase indice")}
        </div>
      )}
    </div>
  );
}