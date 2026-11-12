import React from "react";
import PlaylistCover from "@/components/media/PlaylistCover";
import ListeTriable from "@/components/media/ListeTriable";

/** Arrondi des vignettes de playlists (environ 18 % du côté, proche des icônes Android). */
export const COINS_VIGNETTE = "rounded-[18%] ring-1 ring-black/5";

/**
 * Grille de playlists ou de sous-playlists, au style de Musique (couverture carrée + nom).
 * En réorganisation (admin, cadenas ouvert) : liste à glisser, même mécanisme que la réorganisation YouTube.
 */
export default function GrillePlaylists({ id, items, reorganiser = false, onReorder, onOuvrir }) {
  if (reorganiser) {
    return (
      <ListeTriable
        id={id}
        items={items}
        onReorder={onReorder}
        renderRow={(p) => (
          <>
            <PlaylistCover playlist={p} className="h-10 w-10 shrink-0 rounded-[10px]" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</span>
          </>
        )}
      />
    );
  }
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
      {items.map((p) => (
        <div key={p.id} className="relative group w-full p-1 text-center transition-transform duration-150 select-none hover:-translate-y-1">
          <button type="button" onClick={() => onOuvrir(p)} className="w-full text-center">
            {/* Carré à coins légèrement arrondis, comme une icône d'application Android. */}
            <PlaylistCover playlist={p} className={`mx-auto aspect-square w-full mb-1.5 ${COINS_VIGNETTE}`} />
            <div className="font-bold text-xs line-clamp-2">{p.name}</div>
          </button>
        </div>
      ))}
    </div>
  );
}
