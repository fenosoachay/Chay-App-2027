import React from "react";
import { useRadio, MAX_RADIO_RETRIES } from "@/lib/RadioContext";
import Visualizer from "@/components/radio/Visualizer";
import { useToast } from "@/components/ui/use-toast";
import { RADIO_LOGO } from "@/lib/mediaConstants";
import { getPublicOrigin } from "@/lib/publicOrigin";
import {
  Play,
  Square,
  Share2,
  Loader2,
  RadioTower,
} from "lucide-react";

export default function RadioPlayer() {
  const {
    state,
    preparing,
    isPlaying,
    error,
    errorCode,
    retries,
    toggle,
    stop,
    retryNow,
  } = useRadio();
  const { toast } = useToast();

  const buffering = preparing || state === "connecting" || state === "buffering";
  const statusText =
    preparing || state === "connecting"
      ? "Connexion…"
      : state === "buffering"
      ? "Mise en mémoire tampon…"
      : "En direct";

  const share = async () => {
    const url = `${getPublicOrigin()}/media?cat=radio`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Radio Chay", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Lien copié" });
      }
    } catch {}
  };

  return (
    <div className="rounded-[2rem] border border-border bg-card overflow-hidden">
      <div className="brand-gradient p-8 md:p-12 text-white text-center">
        <div className="flex items-center justify-center gap-2 mb-5">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
              isPlaying || buffering ? "bg-white/15" : "bg-white/10 opacity-70"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isPlaying ? "bg-white animate-pulse" : "bg-white/50"}`} />
            En direct
          </span>
        </div>

        <img
          src={RADIO_LOGO}
          alt="Radio Chay"
          className="h-20 w-20 rounded-2xl object-cover mx-auto mb-4 shadow-lg"
        />
        <h3 className="font-display font-extrabold text-3xl">Radio Chay</h3>
        <p className="text-white/80 mt-2">Louange & la Parole, 24h/24</p>

        <div className="mt-6 h-10 flex items-end justify-center text-white">
          {buffering ? (
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="h-5 w-5 animate-spin" />
              {statusText}
            </div>
          ) : (
            <Visualizer active={isPlaying} loading={false} bars={7} className="h-10" />
          )}
        </div>
      </div>

      <div className="p-5 md:p-6 flex flex-col items-center gap-5">
        {error ? (
          <div className="w-full text-center py-3">
            <RadioTower className="h-10 w-10 mx-auto text-destructive mb-2" />
            <p className="font-semibold text-foreground/80">
              Radio indisponible pour le moment
            </p>
            {retries < 5 ? (
              <p className="text-xs text-foreground/50 mt-1">
                Nouvelle tentative automatique… ({retries}/{MAX_RADIO_RETRIES})
              </p>
            ) : (
              <button
                onClick={retryNow}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold"
              >
                <Loader2 className="h-4 w-4" /> Réessayer
              </button>
            )}
            {errorCode != null && (
              <p className="text-[10px] text-foreground/30 mt-1">code {errorCode}</p>
            )}
          </div>
        ) : (
          <button
            onClick={toggle}
            aria-label={
              isPlaying
                ? "Lecture radio en cours, appuyez pour arrêter"
                : "Radio arrêtée, appuyez pour lancer la lecture"
            }
            className="h-16 w-16 rounded-full brand-gradient text-white grid place-items-center shadow-lg hover:scale-105 active:scale-95 transition"
          >
            {buffering ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : isPlaying ? (
              <Square className="h-6 w-6" />
            ) : (
              <Play className="h-7 w-7 ml-0.5" />
            )}
          </button>
        )}

        <button
          onClick={share}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/60 hover:text-primary"
        >
          <Share2 className="h-4 w-4" /> Partager la radio
        </button>
      </div>
    </div>
  );
}