import React, { useCallback, useRef } from "react";

export function formatTime(t) {
  if (!t || !isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SeekBar({ currentTime, duration, onSeek, bufferedRatio = 0 }) {
  const barRef = useRef(null);
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufPct = Math.max(0, Math.min(100, (bufferedRatio || 0) * 100));

  const seekFromEvent = useCallback(
    (clientX) => {
      const el = barRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e) => {
    if (e.buttons !== 1) return;
    seekFromEvent(e.clientX);
  };
  const onKeyDown = (event) => {
    const step = event.shiftKey ? 10 : 5;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onSeek(Math.min(duration, currentTime + step));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onSeek(duration);
    }
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[0.625rem] tabular-nums text-foreground/55 w-8 text-right">
        {formatTime(currentTime)}
      </span>
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label="Progression de lecture"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} sur ${formatTime(duration)}`}
        tabIndex={0}
        className="relative flex-1 h-5 flex items-center cursor-pointer touch-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-foreground/15" style={{ width: `${bufPct}%` }} />
          <div className="absolute top-0 left-0 h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute h-3.5 w-3.5 rounded-full bg-primary shadow -translate-x-1/2 pointer-events-none"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="text-[0.625rem] tabular-nums text-foreground/55 w-8">
        {formatTime(duration)}
      </span>
    </div>
  );
}