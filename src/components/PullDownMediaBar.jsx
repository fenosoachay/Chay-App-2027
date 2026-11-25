import React, { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Film,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Music,
  Pause,
  Play,
  Radio,
  Square,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { getMediaControlKey, subscribeMediaControl } from "@/lib/mediaControl";
import { Image } from "@/components/ui/image";
import SeekBar from "@/components/player/SeekBar";

const TYPE_LABELS = {
  audio: "Musique",
  music: "Musique",
  sermon: "Prédication",
  sermons: "Prédication",
  predication: "Prédication",
  bible: "Bible audio",
  video: "Film",
  youtube: "YouTube",
  radio: "Radio",
};


function getMediaIcon(type) {
  if (type === "radio") return Radio;
  if (type === "video" || type === "film") return Film;
  if (["sermon", "sermons", "predication"].includes(type)) return Headphones;
  if (type === "gallery") return ImageIcon;
  return Music;
}

export default function PullDownMediaBar() {
  const [control, setControl] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const controlRef = useRef(null);

  const mediaKey = getMediaControlKey(control);

  useEffect(() => subscribeMediaControl(setControl), []);

  // Keep ref updated for use in touch handlers
  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  // Reset visibility when media changes
  useEffect(() => {
    setIsVisible(false);
    touchStartY.current = 0;
    isDragging.current = false;
  }, [mediaKey]);

  // Hide bar if media is paused
  useEffect(() => {
    if (control && !control.isPlaying && isVisible) {
      setIsVisible(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  }, [control?.isPlaying, isVisible]);

  const handleTouchStart = useCallback((e) => {
    // Only start dragging if we're at the top of the screen
    if (!controlRef.current?.isPlaying) return;
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      if (touch.clientY < 50) {
        touchStartY.current = touch.clientY;
        isDragging.current = true;
      }
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current || !controlRef.current?.isPlaying) return;

    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartY.current;

      if (deltaY > 60) {
        setIsVisible(true);
      } else if (deltaY < -30) {
        setIsVisible(false);
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  // This web overlay handles gestures inside the WebView only. Android reserves
  // status-bar swipes for the native notification shade.
  useEffect(() => {
    const options = { passive: true };
    document.addEventListener("touchstart", handleTouchStart, options);
    document.addEventListener("touchmove", handleTouchMove, options);
    document.addEventListener("touchend", handleTouchEnd, options);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!control || !control.isPlaying) {
    return null;
  }

  const Icon = getMediaIcon(control.type);
  const isRadio = control.isLive || control.type === "radio";
  const isBuffering = control.isBuffering;
  const typeLabel = TYPE_LABELS[control.type] || "Média";
  const label = control.subtitle && control.subtitle !== typeLabel
    ? `${typeLabel} · ${control.subtitle}`
    : typeLabel;

  const yOffset = isVisible ? 0 : -400;

  return (
    <AnimatePresence>
      {control && (
        <motion.div
          key={`pull-down-${mediaKey}`}
          initial={{ y: -400, opacity: 0 }}
          animate={{ y: yOffset, opacity: isVisible ? 1 : 0 }}
          exit={{ y: -400, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <motion.section
            aria-label="Barre de commandes multimédias"
            className="mx-auto max-w-3xl overflow-hidden bg-card/95 shadow-xl backdrop-blur-xl pointer-events-auto border-b border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle indicator */}
            <div className="flex flex-col items-center py-2">
              <div className="h-1 w-12 rounded-full bg-muted-foreground/20" />
            </div>

            <div className="px-4 py-3">
              {/* Header with artwork and title */}
              <div className="flex items-start gap-3 mb-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                  {typeof control.artwork === "string" && control.artwork.trim() ? (
                    <Image src={control.artwork} alt="" fittingType="fill" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-foreground truncate">
                    {control.title}
                  </h3>
                  <p className="text-xs text-foreground/60 truncate">
                    {isRadio ? "EN DIRECT" : label}
                  </p>
                  {control.subtitle && control.subtitle !== typeLabel && (
                    <p className="text-xs text-foreground/50 truncate">
                      {control.subtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {!isRadio && control.duration > 0 && control.seek ? (
                <div className="mb-3">
                  <SeekBar
                    currentTime={control.currentTime || 0}
                    duration={control.duration}
                    onSeek={control.seek}
                    bufferedRatio={control.bufferedRatio || 0}
                  />
                </div>
              ) : null}

              {/* Controls */}
              <div className="flex items-center justify-center gap-2">
                {control.previous && (
                  <button
                    type="button"
                    onClick={control.previous}
                    aria-label="Précédent"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
                  >
                    <SkipBack className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={control.toggle}
                  aria-label={isRadio ? "Arrêter la radio" : control.isPlaying ? "Pause" : "Lecture"}
                  aria-pressed={Boolean(control.isPlaying)}
                  disabled={!control.toggle}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70 transition"
                >
                  {isBuffering ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : isRadio ? (
                    <Square className="h-5 w-5" aria-hidden="true" />
                  ) : control.isPlaying ? (
                    <Pause className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Play className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>

                {control.next && (
                  <button
                    type="button"
                    onClick={control.next}
                    aria-label="Suivant"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
                  >
                    <SkipForward className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                {/* Arrêter (musique, prédication, vidéo) : coupe aussi le téléchargement. La radio s'arrête déjà avec ■. */}
                {!isRadio && typeof control.stop === "function" && (
                  <button
                    type="button"
                    onClick={() => control.stop()}
                    aria-label="Arrêter la lecture"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition"
                  >
                    <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
