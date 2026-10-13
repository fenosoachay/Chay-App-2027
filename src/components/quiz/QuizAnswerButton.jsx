import React from "react";
import { Check, X } from "lucide-react";

// state : idle | correct | wrong | dimmed
const STATES = {
  idle: "border-border bg-card hover:border-primary",
  correct: "border-green-500 bg-green-500/15 text-green-500 animate-pulse",
  wrong: "border-red-500 bg-red-500/15 text-red-500",
  dimmed: "border-border bg-card opacity-50",
};

export default function QuizAnswerButton({ letter, text, state, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left font-bold transition ${STATES[state]}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-background/60 text-sm">{letter}</span>
      <span className="flex-1">{text}</span>
      {state === "correct" && <Check className="h-5 w-5" />}
      {state === "wrong" && <X className="h-5 w-5" />}
    </button>
  );
}