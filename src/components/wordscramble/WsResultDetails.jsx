import React from "react";

export default function WsResultDetails({ details, abandoned }) {
  return (
    <ul className="space-y-2 text-left">
      {details.map((d, i) => (
        <li key={i} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <span className="font-bold">Mot {i + 1} : {d.word}</span>
          {d.solved ? (
            <span className="font-bold text-green-500">
              ✅ +{d.score} pts{d.hints_used ? ` (${d.hints_used} indice${d.hints_used > 1 ? "s" : ""})` : ""}
            </span>
          ) : (
            <span className="font-bold text-foreground/50">{abandoned ? "abandonné" : "non résolu"}</span>
          )}
        </li>
      ))}
    </ul>
  );
}