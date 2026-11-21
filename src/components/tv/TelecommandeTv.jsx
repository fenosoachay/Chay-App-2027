import React, { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Square, Tv, Volume1, Volume2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { arreterTv, commandeTv, duree, messageTv, subscribeTv, volumeTv } from "@/lib/tv";

// Télécommande de la diffusion sur TV : visible partout dans l'app tant qu'une diffusion est en cours.
// Pause / reprise, -10 s / +10 s, position, volume de la TV, arrêter.
export default function TelecommandeTv() {
  const [tv, setTv] = useState(null);
  const [glisse, setGlisse] = useState(null); // position pendant qu'on fait glisser la barre
  useEffect(() => subscribeTv(setTv), []);
  if (!tv) return null;

  const enLecture = tv.etat === "PLAYING" || tv.etat === "TRANSITIONING";
  const agir = (f, defaut) => f().catch((e) => toast({ title: defaut, description: messageTv(e, "La TV ne répond pas."), variant: "destructive" }));
  const deplacer = (delta) => agir(() => commandeTv("aller", Math.max(0, (tv.position || 0) + delta)), "Position non changée");
  const volume = (delta) => agir(async () => { const v = await volumeTv(delta); if (typeof v === "number") toast({ title: `Volume de la TV : ${v}` }); }, "Volume");
  const bouton = "grid h-11 w-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      className="fixed inset-x-3 z-[205] mx-auto max-w-lg rounded-[1.5rem] border border-white/10 bg-[#141418]/95 p-3 text-white shadow-2xl backdrop-blur"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      role="region"
      aria-label="Télécommande de la TV"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <Tv className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-bold">Sur {tv.nom}</span>
          <span className="text-white/60"> · {tv.titre}</span>
        </p>
        {tv.etat === "TRANSITIONING" && <span className="text-xs text-white/60">Chargement…</span>}
      </div>

      {!tv.direct && (
        <div className="mb-1 flex items-center gap-2 px-1 text-[0.7rem] text-white/70">
          <span className="w-10 text-right tabular-nums">{duree(glisse ?? tv.position)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(1, tv.duree || 0)}
            step="1"
            value={Math.min(glisse ?? tv.position ?? 0, Math.max(1, tv.duree || 0))}
            onChange={(e) => setGlisse(Number(e.target.value))}
            onPointerUp={() => { if (glisse !== null) { const p = glisse; setGlisse(null); agir(() => commandeTv("aller", p), "Position non changée"); } }}
            onKeyUp={() => { if (glisse !== null) { const p = glisse; setGlisse(null); agir(() => commandeTv("aller", p), "Position non changée"); } }}
            aria-label="Position sur la TV"
            className="h-1 min-w-0 flex-1 accent-white"
          />
          <span className="w-10 tabular-nums">{duree(tv.duree)}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => volume(-5)} aria-label="Baisser le volume de la TV" className={bouton}><Volume1 className="h-5 w-5" /></button>
        {!tv.direct && <button type="button" onClick={() => deplacer(-10)} aria-label="Reculer de 10 secondes" className={bouton}><RotateCcw className="h-5 w-5" /></button>}
        <button
          type="button"
          onClick={() => agir(() => commandeTv(enLecture ? "pause" : "reprendre"), "Commande non envoyée")}
          aria-label={enLecture ? "Pause" : "Lecture"}
          className="grid h-12 w-12 place-items-center rounded-full bg-white text-black"
        >
          {enLecture ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        {!tv.direct && <button type="button" onClick={() => deplacer(10)} aria-label="Avancer de 10 secondes" className={bouton}><RotateCw className="h-5 w-5" /></button>}
        <button type="button" onClick={() => volume(5)} aria-label="Monter le volume de la TV" className={bouton}><Volume2 className="h-5 w-5" /></button>
        <button type="button" onClick={() => arreterTv()} aria-label="Arrêter la diffusion" className={`${bouton} text-red-400`}><Square className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
