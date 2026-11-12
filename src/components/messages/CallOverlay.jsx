import React from "react";
import { X, Phone, Video } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";

export default function CallOverlay({ room, mode, label, onClose }) {
  useBackHandler(true, onClose);
  const audioOnly = mode === "audio";
  const src = `https://meet.jit.si/${room}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=${audioOnly}&config.subject=${encodeURIComponent(
    "CHAY"
  )}&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false`;
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between p-3 text-white bg-black/60">
        <div className="flex items-center gap-2">
          {audioOnly ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          <span className="font-bold text-sm">
            {audioOnly ? "Appel audio" : "Appel vidéo"} — {label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition"
          aria-label="Quitter"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <iframe
        src={src}
        allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write"
        className="flex-1 w-full border-0"
        title="Appel CHAY"
      />
    </div>
  );
}