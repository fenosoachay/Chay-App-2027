import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, File as FichierIcone, Music, Pause, Play } from "lucide-react";
import { formatBytes } from "@/lib/upload";
import { formatDuree, ondeDe } from "@/lib/piecesJointes";

// Pièces jointes des messages (1.3.35) : message vocal et audio (lecteur avec onde, vitesse 1× / 1,5× / 2×),
// vidéo (lecture dans la bulle), photo, document et fichier (ouvrir / télécharger).

/** Un seul audio à la fois : en lancer un met les autres en pause. */
let enCours = null;

export function LecteurVocal({ pj, mine, graine }) {
  const audio = useRef(null);
  const [lecture, setLecture] = useState(false);
  const [temps, setTemps] = useState(0);
  const [duree, setDuree] = useState(Number(pj.duree) || 0);
  const [vitesse, setVitesse] = useState(1);
  const onde = useMemo(() => ondeDe(graine || pj.url, 30), [graine, pj.url]);

  useEffect(() => () => { if (enCours === audio.current) enCours = null; }, []);

  const basculer = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (enCours && enCours !== a) enCours.pause();
      enCours = a;
      a.playbackRate = vitesse;
      a.play().catch(() => setLecture(false));
    } else a.pause();
  };
  const changerVitesse = () => {
    const v = vitesse === 1 ? 1.5 : vitesse === 1.5 ? 2 : 1;
    setVitesse(v);
    if (audio.current) audio.current.playbackRate = v;
  };
  const chercher = (e) => {
    const a = audio.current;
    if (!a || !duree) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(duree, ((e.clientX - r.left) / r.width) * duree));
    setTemps(a.currentTime);
  };
  const part = duree ? Math.min(1, temps / duree) : 0;
  const fort = mine ? "#ffffff" : "hsl(var(--primary))";
  const pale = mine ? "rgba(255,255,255,0.4)" : "hsl(var(--foreground) / 0.22)";

  return (
    <div className="flex w-[15.5rem] max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audio}
        src={pj.url}
        preload="metadata"
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuree(d); }}
        onTimeUpdate={(e) => setTemps(e.currentTarget.currentTime)}
        onPlay={() => setLecture(true)}
        onPause={() => setLecture(false)}
        onEnded={(e) => { setLecture(false); setTemps(0); e.currentTarget.currentTime = 0; }}
      />
      <button
        type="button"
        onClick={basculer}
        aria-label={lecture ? "Pause" : pj.genre === "vocal" ? "Écouter le message vocal" : "Écouter"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-90 ${mine ? "bg-white text-primary" : "bg-primary text-primary-foreground"}`}
      >
        {lecture ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        {pj.genre === "audio" && <div className={`mb-0.5 truncate text-xs font-semibold ${mine ? "text-white/90" : "text-foreground/75"}`}>{pj.nom}</div>}
        <button type="button" onClick={chercher} className="flex h-7 w-full items-center gap-[2px]" aria-label="Avancer dans l'audio">
          {onde.map((h, i) => {
            const passe = (i + 0.5) / onde.length <= part;
            const ici = lecture && Math.abs((i + 0.5) / onde.length - part) < 0.05;
            return (
              <span
                key={i}
                className="w-[3px] flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${Math.round(h * 100)}%`, background: passe ? fort : pale,
                  animation: ici ? "chay-onde .5s ease-in-out infinite" : undefined, transformOrigin: "50% 50%",
                }}
              />
            );
          })}
        </button>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`text-[0.6875rem] tabular-nums ${mine ? "text-white/85" : "text-foreground/55"}`}>{formatDuree(lecture || temps ? temps : duree)}</span>
        <button type="button" onClick={changerVitesse} className={`rounded-full px-1.5 text-[0.625rem] font-bold ${mine ? "bg-white/20 text-white" : "bg-muted text-foreground/70"}`} aria-label={`Vitesse ${vitesse}×`}>
          {String(vitesse).replace(".", ",")}×
        </button>
      </div>
    </div>
  );
}

function CarteFichier({ pj, mine }) {
  const Icone = pj.genre === "document" ? FileText : pj.genre === "audio" ? Music : FichierIcone;
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(pj.nom || "") || [])[1]?.toUpperCase();
  return (
    <a
      href={pj.url}
      target="_blank"
      rel="noopener noreferrer"
      download={pj.nom}
     
      className={`flex w-[15.5rem] max-w-full items-center gap-3 py-0.5 ${mine ? "text-white" : "text-foreground"}`}
      aria-label={`Ouvrir ${pj.nom}`}
    >
      <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${mine ? "bg-white/20" : "bg-primary/15 text-primary"}`}>
        <Icone className="h-5 w-5" />
        {ext && <span className={`absolute -bottom-1 rounded px-1 text-[0.5rem] font-extrabold ${mine ? "bg-white text-primary" : "bg-primary text-primary-foreground"}`}>{ext}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{pj.nom}</span>
        <span className={`block text-[0.6875rem] ${mine ? "text-white/75" : "text-foreground/50"}`}>{formatBytes(pj.taille || 0)}</span>
      </span>
      <Download className={`h-4 w-4 shrink-0 ${mine ? "text-white/80" : "text-foreground/45"}`} />
    </a>
  );
}

export default function PieceJointeBulle({ pj, mine, graine, onVoirPhoto }) {
  if (!pj?.url) return null;
  if (pj.genre === "vocal" || pj.genre === "audio") return <LecteurVocal pj={pj} mine={mine} graine={graine} />;
  if (pj.genre === "video") {
    return (
      <video
        src={pj.url}
        controls
        playsInline
        preload="metadata"
       
        className="block max-h-80 w-[15.5rem] max-w-full rounded-[10px] bg-black"
        aria-label="Vidéo envoyée"
      />
    );
  }
  if (pj.genre === "image") {
    return (
      <button type="button" onClick={() => onVoirPhoto?.(pj.url)} className="block overflow-hidden rounded-[10px]" aria-label="Agrandir la photo">
        <img src={pj.url} alt="" loading="lazy" className="block max-h-72 w-[15rem] max-w-full object-cover" />
      </button>
    );
  }
  return <CarteFichier pj={pj} mine={mine} />;
}
