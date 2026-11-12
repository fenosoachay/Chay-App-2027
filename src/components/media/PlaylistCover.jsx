import React, { useEffect, useState } from "react";
import { isValidPlaylistImageUrl } from "@/lib/playlist";

export default function PlaylistCover({ playlist, className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const coverUrl = playlist?.cover_url;

  useEffect(() => {
    setImageFailed(false);
  }, [coverUrl]);

  const hasImage = isValidPlaylistImageUrl(coverUrl) && !imageFailed;

  return (
    <div
      className={`grid place-items-center overflow-hidden bg-muted ${className}`}
      aria-label={hasImage ? `Image de ${playlist?.name || "la playlist"}` : "Image de playlist indisponible"}
    >
      {hasImage ? (
        <img
          src={coverUrl}
          alt={playlist?.name || "Playlist"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="px-2 text-center text-[0.625rem] font-medium text-muted-foreground">
          Image indisponible
        </span>
      )}
    </div>
  );
}
