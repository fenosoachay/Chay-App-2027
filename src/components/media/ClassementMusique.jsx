import React from "react";
import { Music } from "lucide-react";
import { filePlaylist } from "@/lib/fileLecture";
import { texteEcoutes } from "@/lib/classementMusique";

// 1.4.1 : Multimédia › Musique : « Les musiques les plus écoutées », directement sous toutes les playlists.
// Les 10 premières seulement : 2 rangées de 5, de la même taille (médailles or, argent, bronze sur les 3 premières).
// Toucher un titre : lecture du classement à partir de ce titre (lecteur habituel, écoutes comptées).

const MEDAILLES = {
  1: "bg-gradient-to-br from-[#FFE08A] to-[#E0A526] text-[#3a2600] border-0",
  2: "bg-gradient-to-br from-[#F2F2F7] to-[#A9AFBF] text-[#222] border-0",
  3: "bg-gradient-to-br from-[#F3C08F] to-[#B36B2C] text-[#2b1500] border-0",
};

function Rang({ rang }) {
  return (
    <span
      className={`absolute -left-1.5 -top-1.5 z-[2] grid h-5 min-w-[1.25rem] place-items-center rounded-full border border-white/35 bg-[#1b1830] px-1 text-[0.625rem] font-extrabold text-white ${MEDAILLES[rang] || ""}`}
    >
      {rang}
    </span>
  );
}

function Pochette({ piste, enCours }) {
  return (
    <div className={`relative aspect-square w-full overflow-hidden rounded-xl bg-muted ${enCours ? "ring-[2.5px] ring-[#FF52B4] ring-offset-2 ring-offset-background" : ""}`}>
      {piste.cover_url ? (
        <img src={piste.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center brand-gradient"><Music className="h-1/3 w-1/3 text-white/90" /></div>
      )}
    </div>
  );
}

export const NB_CLASSEMENT = 10;

export default function ClassementMusique({ pistes: toutes, currentTrack, isPlaying, playQueue, toggle }) {
  const pistes = (toutes || []).slice(0, NB_CLASSEMENT);
  const file = filePlaylist(pistes, "music");
  const jouer = (piste) => {
    if (currentTrack?.id === piste.track_id) { if (!isPlaying) toggle(); return; }
    const i = file.findIndex((f) => f.id === piste.track_id);
    if (i >= 0) playQueue(file, i);
  };
  const enCours = (p) => currentTrack?.id === p.track_id;
  if (!pistes.length) return null;
  return (
    <section className="mt-10" aria-label="Les musiques les plus écoutées">
      <h2 className="mb-5 font-display text-2xl font-extrabold">Les musiques les plus écoutées</h2>
      <div className="grid max-w-3xl grid-cols-5 gap-x-2 gap-y-4 md:gap-x-4">
        {pistes.map((p) => (
          <button key={p.track_id} type="button" onClick={() => jouer(p)} className="min-w-0 text-left" aria-label={`${p.rang}. ${p.title}, ${texteEcoutes(p.ecoutes)}`}>
            <div className="relative"><Pochette piste={p} enCours={enCours(p)} /><Rang rang={p.rang} /></div>
            <p className="mt-1 text-[0.625rem] font-bold leading-tight line-clamp-2">{p.title}</p>
            <p className="text-[0.5625rem] text-foreground/50">{texteEcoutes(p.ecoutes)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
