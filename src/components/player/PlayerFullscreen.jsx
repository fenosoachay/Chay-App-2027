import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ChevronDown,
  Music,
  Loader2,
  X,
} from "lucide-react";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { Image } from "@/components/ui/image";
import SeekBar from "./SeekBar";
import { useBackHandler } from "@/hooks/useBackHandler";

export default function PlayerFullscreen({ onCollapse, cover }) {
  useBackHandler(true, onCollapse);
  const {
    currentTrack,
    isPlaying,
    toggle,
    next,
    prev,
    shuffle,
    loop,
    toggleShuffle,
    toggleLoop,
    currentTime,
    duration,
    seek,
    playerState,
    bufferedRatio,
  } = useAudioPlayer();

  if (!currentTrack) return null;
  const LoopIcon = loop === "one" ? Repeat1 : Repeat;
  const buffering = playerState === "connecting" || playerState === "buffering";

  return (
    <div className="fixed inset-0 z-[60] bg-background/98 backdrop-blur-xl flex flex-col animate-float-in">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onCollapse}
          className="h-10 w-10 grid place-items-center rounded-full hover:bg-muted"
          aria-label="Réduire"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          En lecture
        </span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Réduire le lecteur et continuer la lecture"
          className="grid h-10 w-10 place-items-center rounded-full text-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 overflow-y-auto">
        <div className="w-full max-w-sm aspect-square rounded-3xl overflow-hidden shadow-2xl">
          {cover ? (
            <Image src={cover} fittingType="fill" className="w-full h-full" />
          ) : (
            <div className="w-full h-full brand-gradient grid place-items-center">
              <Music className="h-16 w-16 text-white/90" />
            </div>
          )}
        </div>
        <div className="text-center w-full max-w-sm">
          <div className="font-display font-extrabold text-2xl truncate">
            {currentTrack.title}
          </div>
          <div className="text-foreground/60 mt-1 truncate">
            {currentTrack.artist || currentTrack.speaker || "Chay"}
          </div>
        </div>
      </div>

      <div className="px-6 pb-10 max-w-md mx-auto w-full">
        <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} bufferedRatio={bufferedRatio} className="mb-6" />
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={toggleShuffle}
            className={`h-12 w-12 grid place-items-center rounded-full transition ${
              shuffle ? "text-primary bg-primary/10" : "text-foreground/60 hover:text-foreground"
            }`}
            aria-label="Lecture aléatoire"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <button
            onClick={prev}
            className="h-14 w-14 grid place-items-center text-foreground hover:text-primary"
            aria-label="Précédent"
          >
            <SkipBack className="h-7 w-7" />
          </button>
          <button
            onClick={toggle}
            className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg"
            aria-label={isPlaying ? "Pause" : "Lecture"}
          >
            {buffering ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-7 w-7" />
            ) : (
              <Play className="h-7 w-7" />
            )}
          </button>
          <button
            onClick={next}
            className="h-14 w-14 grid place-items-center text-foreground hover:text-primary"
            aria-label="Suivant"
          >
            <SkipForward className="h-7 w-7" />
          </button>
          <button
            onClick={toggleLoop}
            className={`h-12 w-12 grid place-items-center rounded-full transition relative ${
              loop !== "off" ? "text-primary bg-primary/10" : "text-foreground/60 hover:text-foreground"
            }`}
            aria-label="Lecture en boucle"
          >
            <LoopIcon className="h-5 w-5" />
            {loop === "all" && (
              <span className="absolute -bottom-0.5 text-[0.5rem] font-extrabold leading-none">∞</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}