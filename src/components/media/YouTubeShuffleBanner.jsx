import React from "react";
import { Shuffle } from "lucide-react";

// Bandeau « mode aléatoire » + question de fin de liste.
export default function YouTubeShuffleBanner({ shuffleOn, finished, onRestart, onDismiss }) {
  if (!shuffleOn) return null;
  return (
    <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 animate-float-in">
      <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
        <Shuffle className="h-4 w-4" /> Mode aléatoire activé
      </p>
      {finished && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Recommencer la lecture aléatoire ?</span>
          <button type="button" onClick={onRestart} className="rounded-full brand-gradient px-4 py-1.5 text-sm font-bold text-white">
            Oui
          </button>
          <button type="button" onClick={onDismiss} className="rounded-full border border-border px-4 py-1.5 text-sm font-bold">
            Non
          </button>
        </div>
      )}
    </div>
  );
}