import React from "react";
import { CATEGORIES } from "@/lib/mediaConstants";

export default function CategoryGrid({ onOpen, radioPlaying, onToggleRadio }) {
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 md:gap-6">
      {/* « Votre Playlist » est visible pour TOUS les utilisateurs, admins inclus. */}
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const isRadio = c.id === "radio";
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="group flex flex-col items-center gap-2"
          >
            <span
              className={`relative aspect-square w-full rounded-[1.5rem] bg-gradient-to-br ${c.tone} grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-lg transition-all`}
            >
              <Icon className="h-9 w-9 md:h-10 md:w-10" />
              {isRadio && radioPlaying && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
                </span>
              )}
            </span>
            {/* whitespace-nowrap : « Prédications » ne doit JAMAIS casser au
                milieu du mot (le « s » seul sur une 2e ligne) — même avec une
                grande taille de texte réglée dans l'app. */}
            <span className="text-2xs md:text-sm font-semibold text-foreground/70 text-center leading-tight whitespace-nowrap">
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}