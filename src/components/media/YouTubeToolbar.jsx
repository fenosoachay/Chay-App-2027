import React from "react";
import { Lock, LockOpen, Shuffle } from "lucide-react";

export default function YouTubeToolbar({
  locked, shuffleOn, pulse, disabled,
  onToggleShuffle, onToggleLock,
}) {
  const lockTip = locked
    ? "Playlist verrouillée. Cliquez sur le cadenas pour réorganiser."
    : "Playlist déverrouillée. Glissez les vidéos pour réorganiser.";
  const LockIcon = locked ? Lock : LockOpen;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        type="button"
        onClick={onToggleLock}
        title={lockTip}
        aria-label={lockTip}
        aria-pressed={!locked}
        className={`grid h-11 w-11 place-items-center rounded-full border transition active:scale-90 ${
          locked ? "border-border bg-card text-foreground/70" : "border-primary bg-primary/10 text-primary"
        }`}
      >
        <LockIcon key={String(locked)} className="h-5 w-5 animate-float-in" />
      </button>

      <button
        type="button"
        onClick={onToggleShuffle}
        disabled={disabled}
        aria-pressed={shuffleOn}
        aria-label="Lecture aléatoire"
        title="Lecture aléatoire"
        className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${pulse ? "animate-pulse" : ""} ${
          shuffleOn ? "brand-gradient text-white" : "border border-border bg-card text-foreground/70"
        }`}
      >
        <Shuffle className="h-5 w-5" />
      </button>
    </div>
  );
}