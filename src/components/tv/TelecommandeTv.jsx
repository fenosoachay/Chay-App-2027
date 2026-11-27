import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Square, Tv, Volume1, Volume2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { arreterTv, commandeTv, duree, messageTv, subscribeTv, volumeTv } from "@/lib/tv";

// Télécommande de la diffusion sur TV : visible partout dans l'app tant qu'une diffusion est en cours.
// Pause / reprise, -10 s / +10 s, position, volume de la TV, arrêter.
// Avancer / reculer : un appui = 10 s ; appuis rapprochés ou bouton MAINTENU = ça défile
// (de plus en plus vite), puis une seule demande à la TV quand on relâche.
export default function TelecommandeTv() {
  const [tv, setTv] = useState(null);
  const [glisse, setGlisse] = useState(null); // position visée (barre glissée ou bouton maintenu)
  const cible = useRef(null);
  const minuterie = useRef({ repete: null, envoi: null, debut: 0 });
  useEffect(() => subscribeTv(setTv), []);
  useEffect(() => () => { clearInterval(minuterie.current.repete); clearTimeout(minuterie.current.envoi); }, []);
  if (!tv) return null;

  const enLecture = tv.etat === "PLAYING" || tv.etat === "TRANSITIONING";
  const agir = (f, defaut) => f().catch((e) => toast({ title: defaut, description: messageTv(e, "La TV ne répond pas."), variant: "destructive" }));
  const borner = (p) => Math.max(0, tv.duree > 0 ? Math.min(p, tv.duree - 2) : p);
  const pas = (delta) => {
    const m = minuterie.current;
    const vite = Date.now() - m.debut > 2500 ? 3 : 1; // après 2,5 s maintenu : 30 s par pas
    cible.current = borner((cible.current ?? tv.position ?? 0) + delta * vite);
    setGlisse(cible.current);
  };
  const envoyer = () => {
    const p = cible.current;
    cible.current = null;
    setGlisse(null);
    if (p !== null) agir(() => commandeTv("aller", p), "Position non changée");
  };
  const appuyer = (delta) => (e) => {
    e.preventDefault();
    const m = minuterie.current;
    clearTimeout(m.envoi);
    clearInterval(m.repete);
    m.debut = Date.now();
    pas(delta);
    m.repete = setInterval(() => pas(delta), 250);
  };
  const relacher = () => {
    const m = minuterie.current;
    if (!m.repete) return;
    clearInterval(m.repete);
    m.repete = null;
    m.envoi = setTimeout(envoyer, 600); // appuis rapprochés : on attend un peu avant d'envoyer
  };
  const toucheClavier = (delta) => (e) => {
    if (e.detail !== 0) return; // vrai clic : déjà traité par les évènements pointeur
    clearTimeout(minuterie.current.envoi);
    minuterie.current.debut = Date.now();
    pas(delta);
    minuterie.current.envoi = setTimeout(envoyer, 600);
  };
  const boutonDeplacer = (delta, label, Icone) => (
    <button
      type="button"
      onPointerDown={appuyer(delta)}
      onPointerUp={relacher}
      onPointerLeave={relacher}
      onPointerCancel={relacher}
      onClick={toucheClavier(delta)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      className={`${bouton} select-none touch-none`}
    >
      <Icone className="h-5 w-5" />
    </button>
  );
  const volume = (delta) => agir(async () => { const v = await volumeTv(delta); if (typeof v === "number") toast({ title: `Volume de la TV : ${v}` }); }, "Volume");
  const bouton = "grid h-11 w-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      className="fixed inset-x-3 z-[205] mx-auto max-w-lg rounded-[1.5rem] border border-white/10 bg-[#141418]/95 p-3 text-white shadow-2xl backdrop-blur"
      style={{ bottom: "calc(5.5rem + var(--sa-bottom))" }}
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
        {!tv.direct && boutonDeplacer(-10, "Reculer (maintenir pour reculer vite)", RotateCcw)}
        <button
          type="button"
          onClick={() => agir(() => commandeTv(enLecture ? "pause" : "reprendre"), "Commande non envoyée")}
          aria-label={enLecture ? "Pause" : "Lecture"}
          className="grid h-12 w-12 place-items-center rounded-full bg-white text-black"
        >
          {enLecture ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        {!tv.direct && boutonDeplacer(10, "Avancer (maintenir pour avancer vite)", RotateCw)}
        <button type="button" onClick={() => volume(5)} aria-label="Monter le volume de la TV" className={bouton}><Volume2 className="h-5 w-5" /></button>
        <button type="button" onClick={() => arreterTv()} aria-label="Arrêter la diffusion" className={`${bouton} text-red-400`}><Square className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
