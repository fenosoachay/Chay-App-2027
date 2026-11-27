import React from "react";
import { X } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";

export default function VideoCall({ room, onClose }) {
  useBackHandler(true, onClose);
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col pt-[var(--sa-top)]">
      <div className="flex items-center justify-between p-3 text-white bg-black/60">
        <span className="font-bold text-sm">Appel vidéo — Communauté CHAY</span>
        <button
          onClick={onClose}
          className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition"
          aria-label="Quitter"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <iframe
        src={`https://meet.jit.si/${room}#config.prejoinPageEnabled=false&config.startWithVideoMuted=false`}
        allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write"
        className="flex-1 w-full border-0"
        title="Appel vidéo CHAY"
      />
    </div>
  );
}