import React from "react";
import { motion } from "framer-motion";
import WsTile from "@/components/wordscramble/WsTile";

// Cases de réponse : les cases vides sont des emplacements, les cases remplies des lettres cliquables.
export default function WsAnswerRow({ length, placed, lockedId, feedback, onRemove }) {
  // 1.3.34 : faux -> la ligne tremble ; juste -> les lettres sautent en vague.
  return (
    <motion.div
      className="flex flex-wrap justify-center gap-2"
      animate={feedback === "wrong" ? { x: [0, -12, 12, -8, 8, -4, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {Array.from({ length }).map((_, i) => {
        const tile = placed[i];
        if (!tile) {
          return <div key={i} className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border-2 border-dashed border-border" />;
        }
        const state = feedback === "correct" ? "correct" : feedback === "wrong" ? "wrong" : tile.id === lockedId ? "locked" : "idle";
        return <WsTile key={tile.id} layoutId={`ws-${tile.id}`} index={i} char={tile.char} state={state} onClick={() => onRemove(tile)} />;
      })}
    </motion.div>
  );
}
