import React from "react";

const STATES = {
  idle: "border-border bg-card hover:border-primary hover:-translate-y-0.5",
  locked: "border-primary bg-primary/15 text-primary",
  correct: "border-green-500 bg-green-500/15 text-green-500",
  wrong: "border-red-500 bg-red-500/15 text-red-500",
};

export default function WsTile({ char, state = "idle", disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-2xl border-2 font-display font-extrabold text-xl sm:text-2xl transition ${STATES[state]}`}
    >
      {char}
    </button>
  );
}