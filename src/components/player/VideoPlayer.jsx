import React from "react";
import { Film, Play } from "lucide-react";
import { Image } from "@/components/ui/image";
import { clearMediaControl, requestMediaPlayback } from "@/lib/mediaControl";

export default function VideoPlayer({
  src,
  poster,
  title = "Film",
  queue = [],
  currentIndex = 0,
  className = "",
  onHalfway, // ← 1. AJOUTÉ : On accepte la fonction de rappel
}) {
  const startPlayback = () => {
    const startAt = (index) => {
      const item = queue[index];
      const source = item?.src || src;
      const itemTitle = item?.title || title;
      const artwork = item?.poster || poster || null;
      let id;
      const stop = () => clearMediaControl(id);
      
      id = requestMediaPlayback({
        type: "video",
        engine: "video",
        title: itemTitle,
        subtitle: "Film",
        artwork,
        source,
        isPlaying: true,
        isBuffering: true,
        currentTime: 0,
        duration: 0,
        isLive: false,
        previous: index > 0 ? () => startAt(index - 1) : null,
        next: index < queue.length - 1 ? () => startAt(index + 1) : null,
        queue,
        queueIndex: index,
        seek: null,
        toggle: null,
        stop,
        onHalfway, // ← 2. AJOUTÉ : On la transmet au contrôleur média global
      }, "video");
    };
    startAt(currentIndex);
  };

  return (
    <button
      type="button"
      onClick={startPlayback}
      aria-label={`Lire le film ${title}`}
      className={`group relative grid min-h-40 w-full place-items-center overflow-hidden rounded-xl bg-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {poster ? (
        <Image 
          src={poster} 
          alt="" 
          fittingType="fill" 
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition group-hover:opacity-60" 
        />
      ) : (
        <Film className="absolute h-12 w-12 text-white/30" aria-hidden="true" />
      )}
      <span className="relative grid h-14 w-14 place-items-center rounded-full bg-black/55 shadow-lg transition group-hover:scale-105">
        <Play className="ml-0.5 h-6 w-6" aria-hidden="true" />
      </span>
    </button>
  );
}