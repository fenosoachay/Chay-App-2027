import React from "react";
import { WifiOff } from "lucide-react";

export default function OfflinePlayerNotice({ onRetry }) {
  return (
    <div className="my-auto flex flex-col items-center gap-3 py-10 text-center">
      <WifiOff className="h-10 w-10 text-white/60" />
      <p className="font-bold">Connexion requise pour lire la vidéo</p>
      <button type="button" onClick={onRetry} className="rounded-full brand-gradient px-5 py-2.5 text-sm font-bold text-white">
        Réessayer
      </button>
    </div>
  );
}