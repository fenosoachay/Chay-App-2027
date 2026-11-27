import React from "react";
import { ChevronLeft, ChevronRight, Music, Trophy } from "lucide-react";
import { filePlaylist } from "@/lib/fileLecture";
import { texteEcoutes } from "@/lib/classementMusique";

// 1.4.1 : Multimédia › Musique › Classement (choix 3 : podium + grille).
// Les 3 premiers sur un podium, puis 5 par rangée à partir du 4e, jusqu'à la fin de la liste.
// Toucher un titre : lecture du classement à partir de ce titre (lecteur habituel, écoutes comptées).

const MEDAILLES = {
  1: "bg-gradient-to-br from-[#FFE08A] to-[#E0A526] text-[#3a2600] border-0",
  2: "bg-gradient-to-br from-[#F2F2F7] to-[#A9AFBF] text-[#222] border-0",
  3: "bg-gradient-to-br from-[#F3C08F] to-[#B36B2C] text-[#2b1500] border-0",
};

function Rang({ rang, grand = false }) {
  return (
    <span
      className={`absolute z-[2] grid place-items-center rounded-full border border-white/35 bg-[#1b1830] font-extrabold text-white ${MEDAILLES[rang] || ""} ${
        grand ? "-left-2 -top-2 h-7 min-w-[1.75rem] px-1 text-[0.8125rem]" : "-left-1.5 -top-1.5 h-5 min-w-[1.25rem] px-1 text-[0.625rem]"
      }`}
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

/** Entrée « Classement » à la fin de la page Musique. */
export function EntreeClassement({ pistes, onOuvrir }) {
  if (!pistes?.length) return null;
  const top = pistes.slice(0, 3);
  return (
    <section className="mt-8">
      <h3 className="mb-3 font-display text-lg font-extrabold">Classement</h3>
      <button
        type="button"
        onClick={onOuvrir}
        className="flex w-full items-center gap-3 rounded-[1.375rem] border border-[#FFD27A]/30 bg-gradient-to-br from-[#FFC850]/15 to-[#FF52B4]/10 p-3.5 text-left"
      >
        <Trophy className="h-6 w-6 shrink-0 text-[#FFD36E]" />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">Les plus écoutées</span>
          <span className="mt-0.5 block text-xs text-foreground/60 line-clamp-2">{top.map((t) => `${t.rang}. ${t.title}`).join(" · ")}</span>
        </span>
        <span className="flex shrink-0">
          {top.map((t) => (
            <span key={t.track_id} className="-ml-2.5 block h-9 w-9 overflow-hidden rounded-xl border-2 border-background first:ml-0">
              <Pochette piste={t} />
            </span>
          ))}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/40" />
      </button>
    </section>
  );
}

export default function ClassementMusique({ pistes, onRetour, currentTrack, isPlaying, playQueue, toggle }) {
  const file = filePlaylist(pistes, "music");
  const jouer = (piste) => {
    if (currentTrack?.id === piste.track_id) { if (!isPlaying) toggle(); return; }
    const i = file.findIndex((f) => f.id === piste.track_id);
    if (i >= 0) playQueue(file, i);
  };
  const enCours = (p) => currentTrack?.id === p.track_id;
  const [premier, deuxieme, troisieme] = pistes;
  const suite = pistes.slice(3);

  const Podium = ({ piste, socle }) => (
    piste ? (
      <button type="button" onClick={() => jouer(piste)} className="w-[31%] text-center" aria-label={`${piste.rang}. ${piste.title}, ${texteEcoutes(piste.ecoutes)}`}>
        <div className="relative"><Pochette piste={piste} enCours={enCours(piste)} /><Rang rang={piste.rang} grand /></div>
        <p className="mt-1.5 text-[0.75rem] font-bold leading-tight line-clamp-2">{piste.title}</p>
        <p className="text-[0.625rem] text-foreground/50">{texteEcoutes(piste.ecoutes)}</p>
        <div className="mt-1.5 rounded-t-xl rounded-b-sm bg-foreground/[0.07]" style={{ height: socle }} />
      </button>
    ) : <div className="w-[31%]" />
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <button type="button" onClick={onRetour} aria-label="Retour à Musique" className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 truncate font-display text-2xl font-extrabold">Classement</h2>
      </div>
      <p className="mb-5 text-sm text-foreground/55">Les musiques les plus écoutées</p>

      <div className="mb-5 flex items-end justify-center gap-2.5">
        <Podium piste={deuxieme} socle={26} />
        <Podium piste={premier} socle={44} />
        <Podium piste={troisieme} socle={14} />
      </div>

      {suite.length > 0 && (
        <div className="grid grid-cols-5 gap-x-2 gap-y-3">
          {suite.map((p) => (
            <button key={p.track_id} type="button" onClick={() => jouer(p)} className="min-w-0 text-left" aria-label={`${p.rang}. ${p.title}, ${texteEcoutes(p.ecoutes)}`}>
              <div className="relative"><Pochette piste={p} enCours={enCours(p)} /><Rang rang={p.rang} /></div>
              <p className="mt-1 text-[0.625rem] font-bold leading-tight line-clamp-2">{p.title}</p>
              <p className="text-[0.5625rem] text-foreground/50">{texteEcoutes(p.ecoutes)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
