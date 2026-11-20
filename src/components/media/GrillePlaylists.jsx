import React from "react";
import PlaylistCover from "@/components/media/PlaylistCover";
import ListeTriable from "@/components/media/ListeTriable";

/** Arrondi des vignettes de playlists (environ 18 % du côté, proche des icônes Android). */
export const COINS_VIGNETTE = "rounded-[18%] ring-1 ring-black/5";

/**
 * Grille de playlists ou de sous-playlists, au style de Musique (couverture carrée + nom).
 * En réorganisation (admin, cadenas ouvert) : liste à glisser, même mécanisme que la réorganisation YouTube.
 */
/**
 * Nom sous une vignette : on ne coupe jamais un mot en deux (« Célébratio / n »). Le nom peut déborder un peu
 * sur l'espace entre les vignettes (-mx-2), ce qui garde presque la taille normale ; seuls les mots très longs
 * sont un peu réduits. Deux lignes au plus.
 */
function NomPlaylist({ nom }) {
  const plusLong = Math.max(0, ...String(nom || "").split(/\s+/).map((m) => m.length));
  const taille = plusLong >= 14 ? "text-[0.66rem]" : plusLong >= 12 ? "text-[0.7rem]" : "text-xs";
  return (
    <div className={`-mx-2 font-bold ${taille} leading-tight tracking-tight line-clamp-2 [overflow-wrap:normal] [word-break:normal] [hyphens:none]`}>
      {nom}
    </div>
  );
}

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
            <NomPlaylist nom={p.name} />
          </button>
        </div>
      ))}
    </div>
  );
}
