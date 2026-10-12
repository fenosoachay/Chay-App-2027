import React from "react";

// File « à suivre » : la vidéo en cours est surlignée.
export default function PlayerQueueList({ queue = [], index = 0 }) {
  if (queue.length < 2) return null;
  return (
    <div className="mx-auto mb-2 w-full max-w-5xl">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-white/50">À suivre</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {queue.map((item, i) => (
          <li
            key={item.id || i}
            ref={i === index ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
            className={`flex items-center gap-2 rounded-lg p-1.5 text-sm transition ${
              i === index ? "bg-white/15 font-bold" : "text-white/70"
            }`}
          >
            {item.artwork && <img src={item.artwork} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />}
            <span className="min-w-0 truncate">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}