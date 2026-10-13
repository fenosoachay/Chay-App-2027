import React, { useEffect, useRef, useState } from "react";
import { subscribeMediaControl } from "@/lib/mediaControl";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import PlayerFullscreen from "@/components/player/PlayerFullscreen";
import { OPEN_PLAYER_EVENT } from "@/lib/playerUi";

const AUDIO_TYPES = new Set(["audio", "music", "sermon", "sermons", "predication", "bible"]);

// Ouvre directement le lecteur plein écran quand une musique / prédication
// démarre (plus de mini-lecteur). Réduire le lecteur ne coupe pas la lecture ;
// il se rouvre au prochain morceau lancé.
export default function AutoOpenAudioPlayer() {
  const [control, setControl] = useState(null);
  const [open, setOpen] = useState(false);
  const { currentTrack } = useAudioPlayer();
  const lastKeyRef = useRef(null);

  useEffect(() => subscribeMediaControl(setControl), []);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_PLAYER_EVENT, reopen);
    return () => window.removeEventListener(OPEN_PLAYER_EVENT, reopen);
  }, []);

  const isAudio = Boolean(control) && (AUDIO_TYPES.has(control.type) || control.engine === "audio");
  const trackKey = isAudio ? String(currentTrack?.id ?? control.title) : null;

  useEffect(() => {
    if (!isAudio || !currentTrack) {
      lastKeyRef.current = null;
      setOpen(false);
      return;
    }
    if (lastKeyRef.current !== trackKey) {
      lastKeyRef.current = trackKey;
      setOpen(true);
    }
  }, [isAudio, trackKey, currentTrack]);

  if (!open || !isAudio || !currentTrack) return null;
  return <PlayerFullscreen onCollapse={() => setOpen(false)} cover={control.artwork} />;
}