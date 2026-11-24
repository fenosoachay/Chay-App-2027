import React, { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";

// Parole liée à une musique (1.3.25) : petit rond lecture/pause, en haut à droite de la parole (comme le bouton de
// la Webradio du site). La musique passe par le lecteur de l'app : barre de notification pendant la lecture, et
// elle continue si on ferme la parole. Pas de plein écran (piste « discrète »).
export default function LecteurParole({ musiqueId, titreParole }) {
  const { currentTrack, isPlaying, play, toggle } = useAudioPlayer();
  const [piste, setPiste] = useState(null);

  useEffect(() => {
    if (!musiqueId) return undefined;
    let vivant = true;
    base44.entities.MusicTrack.filter({ id: musiqueId }, "-created_date", 1)
      .then((rows) => { if (vivant && rows?.[0]?.audio_url) setPiste(rows[0]); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [musiqueId]);

  if (!piste) return null;
  const actuelle = currentTrack?.id === piste.id;
  const joue = actuelle && isPlaying;
  const appuyer = () => {
    if (actuelle) toggle();
    else play({ ...piste, discret: true, subtitle: piste.artist || titreParole || "Paroles" });
  };

  return (
    <button
      type="button"
      onClick={appuyer}
      aria-label={joue ? "Pause" : `Écouter ${piste.title || "la musique"}`}
      title={piste.title || "Écouter"}
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#1a1206] shadow-[0_4px_14px_rgba(245,180,40,0.45)] transition active:scale-95 ${
        joue ? "bg-gradient-to-br from-[#ffd66b] to-[#f0a81c]" : "bg-gradient-to-br from-[#ffe08a] to-[#f5b93a]"
      }`}
    >
      {joue && <span className="absolute inset-0 animate-ping rounded-full bg-[#f5b93a]/40" aria-hidden="true" />}
      {joue ? <Pause className="relative h-4 w-4" fill="currentColor" /> : <Play className="relative ml-0.5 h-4 w-4" fill="currentColor" />}
    </button>
  );
}
