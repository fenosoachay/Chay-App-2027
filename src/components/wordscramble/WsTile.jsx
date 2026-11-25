import React from "react";
import { motion } from "framer-motion";

const STATES = {
  idle: "border-border bg-card hover:border-primary",
  locked: "border-primary bg-primary/15 text-primary",
  correct: "border-green-500 bg-green-500/15 text-green-500",
  wrong: "border-red-500 bg-red-500/15 text-red-500",
};

// 1.3.34 : lettres animées. `layoutId` : la lettre vole de la réserve à la réponse (et retour) ;
// `index` : arrivée en cascade et vague quand le mot est trouvé ; `melange` : petite pirouette au mélange.
export default function WsTile({ char, state = "idle", disabled, onClick, layoutId, index = 0, melange = 0 }) {
  const trouve = state === "correct";
  return (
    <motion.button
      type="button"
      layout
      layoutId={layoutId}
      onClick={onClick}
      disabled={disabled}
      initial={{ opacity: 0, y: -18, scale: 0.6 }}
      animate={trouve
        ? { opacity: 1, scale: 1, y: [0, -14, 0], rotate: 0, transition: { delay: index * 0.06, duration: 0.45 } }
        : melange
          ? { opacity: 1, scale: 1, y: [0, -10, 0], rotate: melange % 2 ? [0, -16, 10, 0] : [0, 16, -10, 0], transition: { delay: index * 0.025, duration: 0.42, ease: "easeOut" } }
          : { opacity: 1, y: 0, scale: 1, rotate: 0, transition: { delay: index * 0.04, type: "spring", stiffness: 420, damping: 22 } }}
      whileTap={{ scale: 0.88 }}
      transition={{ layout: { type: "spring", stiffness: 520, damping: 34 } }}
      className={`grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-2xl border-2 font-display font-extrabold text-xl sm:text-2xl transition-colors ${STATES[state]}`}
    >
      {char}
    </motion.button>
  );
}
