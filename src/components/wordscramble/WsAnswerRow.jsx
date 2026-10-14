import React from "react";
import WsTile from "@/components/wordscramble/WsTile";

// Cases de réponse : les cases vides sont des emplacements, les cases remplies des lettres cliquables.
export default function WsAnswerRow({ length, placed, lockedId, feedback, onRemove }) {
  const shake = feedback === "wrong" ? "animate-pulse" : "";
  return (
    <div className={`flex flex-wrap justify-center gap-2 ${shake}`}>
      {Array.from({ length }).map((_, i) => {
        const tile = placed[i];
        if (!tile) {
          return <div key={i} className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-dashed border-border" />;
        }
        const state = feedback === "correct" ? "correct" : feedback === "wrong" ? "wrong" : tile.id === lockedId ? "locked" : "idle";
        return <WsTile key={tile.id} char={tile.char} state={state} onClick={() => onRemove(tile)} />;
      })}
    </div>
  );
}