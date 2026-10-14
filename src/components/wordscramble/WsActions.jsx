import React from "react";
import { Shuffle, Delete } from "lucide-react";
import WsHintMenu from "@/components/wordscramble/WsHintMenu";

const btn = "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50";

export default function WsActions({ disabled, credits, onShuffle, onErase, onHint }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button onClick={onShuffle} disabled={disabled} className={btn}>
        <Shuffle className="h-4 w-4" /> Mélanger
      </button>
      <WsHintMenu disabled={disabled} credits={credits} onPick={onHint} />
      <button onClick={onErase} disabled={disabled} className={btn}>
        <Delete className="h-4 w-4" /> Effacer
      </button>
    </div>
  );
}