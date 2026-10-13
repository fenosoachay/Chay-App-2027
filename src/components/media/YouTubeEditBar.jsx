import React from "react";
import { RotateCcw } from "lucide-react";

// Affiché quand le cadenas est ouvert : l'ordre s'enregistre à chaque déplacement.
export default function YouTubeEditBar({ onReset }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold text-primary">Glissez les vidéos pour changer l'ordre.</p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-bold text-foreground/70"
      >
        <RotateCcw className="h-4 w-4" /> Réinitialiser l'ordre
      </button>
    </div>
  );
}