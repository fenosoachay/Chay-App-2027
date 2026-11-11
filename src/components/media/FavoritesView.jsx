import React, { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, Unlock, Music, Play, Pause, Trash2 } from "lucide-react";
import { groupMusicFavorites } from "@/lib/favoritePlaylists";
import { useDragSort } from "@/hooks/useDragSort";
import { appliquerOrdre } from "@/lib/glisserOrdre";

// Poignée ⋮⋮ (glisser) + boutons monter / descendre en secours, visibles en mode arranger.
function Reorganiser({ label, index, total, drag, petite = false }) {
  const bouton = "grid h-9 w-9 place-items-center rounded-full text-foreground/55 hover:bg-muted disabled:opacity-25";
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Glisser pour réorganiser ${label}`}
        className="grid h-11 w-11 cursor-grab select-none place-items-center rounded-full text-foreground/45 active:cursor-grabbing active:bg-muted"
        {...drag.poignee(index)}
      >
        <GripVertical className={petite ? "h-4 w-4" : "h-5 w-5"} />
      </button>
      <div className="flex flex-col">
        <button type="button" className={bouton} aria-label={`Monter ${label}`} disabled={index === 0} onClick={() => drag.monter(index)}>
          <ChevronUp className="h-4 w-4" />
        </button>
        <button type="button" className={bouton} aria-label={`Descendre ${label}`} disabled={index >= total - 1} onClick={() => drag.descendre(index)}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FavoriteGroup({
  group,
  groupIndex,
  groupsCount,
  locked,
  groupDrag,
  onReorderItems,
  currentTrack,
  isPlaying,
  playPlaylistItem,
  removeFromPlaylist,
}) {
  const itemDrag = useDragSort(group.items, (next) => onReorderItems(group, next));
  const items = itemDrag.ordre;
  return (
    <section className={`rounded-2xl border bg-card p-4 ${groupDrag.idGlisse === group.id ? "border-primary shadow-lg" : "border-border"}`}>
      <div className="mb-3 flex items-center gap-2">
        {!locked && groupsCount > 1 && (
          <Reorganiser label={group.name} index={groupIndex} total={groupsCount} drag={groupDrag} />
        )}
        <Music className="h-4 w-4 text-primary" />
        <h3 className="font-bold">{group.name}</h3>
      </div>
      <div ref={itemDrag.listRef} className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 rounded-xl border p-3 transition-shadow ${
              itemDrag.idGlisse === item.id ? "border-primary bg-primary/5 shadow-lg" : "border-border/70"
            }`}
          >
            {!locked && items.length > 1 && (
              <Reorganiser label={item.title} index={index} total={items.length} drag={itemDrag} petite />
            )}
            <button
              type="button"
              onClick={() => playPlaylistItem(item)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={`Lire ${item.title}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Music className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{item.title}</span>
                <span className="block truncate text-xs text-foreground/55">{item.artist || "Audio"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => playPlaylistItem(item)}
              className="h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center"
              aria-label={
                currentTrack?.queueId === item.id && isPlaying
                  ? `Mettre en pause ${item.title}`
                  : `Lire ${item.title}`
              }
            >
              {currentTrack?.queueId === item.id && isPlaying
                ? <Pause className="h-4 w-4" />
                : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => removeFromPlaylist(item.id)}
              className="h-9 w-9 grid place-items-center rounded-full text-foreground/50 hover:text-destructive hover:bg-muted"
              aria-label={`Retirer ${item.title} des favoris`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function FavoritesView({
  playlist = [],
  currentTrack,
  isPlaying,
  playPlaylistItem,
  removeFromPlaylist,
  onReorderItems,
  onReorderPlaylists,
}) {
  const [locked, setLocked] = useState(true);
  const [orderedItems, setOrderedItems] = useState([]);

  useEffect(() => {
    setOrderedItems(
      playlist
        .filter((item) => (item.category || "music") === "music" && item.kind !== "video")
        .sort((a, b) => (a.playlist_order ?? 99999) - (b.playlist_order ?? 99999)
          || (a.order ?? 99999) - (b.order ?? 99999))
    );
  }, [playlist]);

  const groups = useMemo(() => groupMusicFavorites(orderedItems), [orderedItems]);

  const handleReorderGroups = useCallback((next) => {
    const orders = new Map(next.map((group, index) => [group.id, index]));
    setOrderedItems((items) => items.map((item) => ({
      ...item,
      playlist_order: orders.get(item.source_playlist_id || "legacy-favorites"),
    })));
    onReorderPlaylists?.(next);
  }, [onReorderPlaylists]);

  const handleReorderGroupItems = useCallback((group, nextItems) => {
    // Tous les titres du groupe (désormais un seul groupe « Favoris ») reçoivent leur nouveau rang.
    setOrderedItems((items) => appliquerOrdre(items, nextItems, "order"));
    onReorderItems?.(group.id, nextItems);
  }, [onReorderItems]);

  const groupDrag = useDragSort(groups, handleReorderGroups);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-foreground/55">
          Vos chansons favorites, classées par playlist d’origine.
        </p>
        <button
          type="button"
          onClick={() => setLocked((value) => !value)}
          title={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l’ordre"}
          aria-label={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l’ordre"}
          aria-pressed={!locked}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            locked
              ? "border-border bg-card text-muted-foreground hover:bg-muted"
              : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        </button>
      </div>

      {groups.length ? (
        <div ref={groupDrag.listRef} className="space-y-5">
          {groupDrag.ordre.map((group, groupIndex) => (
            <FavoriteGroup
              key={group.id}
              group={group}
              groupIndex={groupIndex}
              groupsCount={groups.length}
              locked={locked}
              groupDrag={groupDrag}
              onReorderItems={handleReorderGroupItems}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              playPlaylistItem={playPlaylistItem}
              removeFromPlaylist={removeFromPlaylist}
            />
          ))}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">
          Aucune chanson favorite pour le moment. Touchez l’étoile dans une playlist musicale pour en ajouter.
        </p>
      )}
    </div>
  );
}
