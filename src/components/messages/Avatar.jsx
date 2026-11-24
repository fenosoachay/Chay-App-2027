import React from "react";
import { Image } from "@/components/ui/image";

export default function Avatar({ name, src, size = 44, online }) {
  const initial = (name || "?")[0]?.toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-photo-profil>
      {src ? (
        <Image
          src={src}
          fittingType="fill"
          className="rounded-full overflow-hidden w-full h-full"
        />
      ) : (
        <div
          className="rounded-full w-full h-full brand-gradient grid place-items-center text-white font-bold"
          style={{ fontSize: size * 0.4 }}
        >
          {initial}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
      )}
    </div>
  );
}