import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { GripVertical, Lock, Unlock, Music, Play, Pause, Trash2 } from "lucide-react";
import { groupMusicFavorites } from "@/lib/favoritePlaylists";

function useDragSort(items, onReorder) {
  const listRef = useRef(null);
  const dragIndex = useRef(null);

  const finishDrag = useCallback((clientY) => {
    const container = listRef.current;
    const from = dragIndex.current;
    if (!container || from === null) return;

    const children = [...container.children];
    let to = children.length - 1;
    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        to = i;
        break;
      }
    }
    children.forEach((child) => child.classList.remove("opacity-50", "scale-[0.98]"));
    dragIndex.current = null;
    if (from !== to && to >= 0 && to < items.length) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    }
  }, [items, onReorder]);

  const onMouseDown = (index) => (event) => {
    event.preventDefault();
    dragIndex.current = index;
    listRef.current?.children[index]?.classList.add("opacity-50", "scale-[0.98]");
    const onUp = (upEvent) => {
      window.removeEventListener("mouseup", onUp);
      finishDrag(upEvent.clientY);
    };
    window.addEventListener("mouseup", onUp);
  };

  const onTouchStart = (index) => () => {
    dragIndex.current = index;
    listRef.current?.children[index]?.classList.add("opacity-50", "scale-[0.98]");
    const onMove = (moveEvent) => moveEvent.preventDefault();
    const onEnd = (endEvent) => {
      listRef.current?.removeEventListener("touchmove", onMove);
      listRef.current?.removeEventListener("touchend", onEnd);
      finishDrag(endEvent.changedTouches[0].clientY);
    };
    listRef.current?.addEventListener("touchmove", onMove, { passive: false });
    listRef.current?.addEventListener("touchend", onEnd, { once: true });
  };

  return { listRef, onMouseDown, onTouchStart };
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
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        {!locked && groupsCount > 1 && (
          <button
            type="button"
            aria-label={`Réorganiser ${group.name}`}
            className="cursor-grab touch-none text-foreground/45"
            onMouseDown={groupDrag.onMouseDown(groupIndex)}
            onTouchStart={groupDrag.onTouchStart(groupIndex)}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        <Music className="h-4 w-4 text-primary" />
        <h3 className="font-bold">{group.name}</h3>
      </div>
      <div ref={locked ? null : itemDrag.listRef} className="space-y-2">
        {group.items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
            {!locked && group.items.length > 1 && (
              <button
                type="button"
                aria-label={`Réorganiser ${item.title}`}
                className="cursor-grab touch-none text-foreground/40"
                onMouseDown={itemDrag.onMouseDown(index)}
                onTouchStart={itemDrag.onTouchStart(index)}
              >
                <GripVertical className="h-4 w-4" />
              </button>
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
    setOrderedItems((items) => {
      const orders = new Map(nextItems.map((item, index) => [item.id, index]));
      return items.map((item) => (item.source_playlist_id || "legacy-favorites") === group.id
        ? { ...item, order: orders.get(item.id) ?? item.order }
        : item);
    });
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
        <div ref={locked ? null : groupDrag.listRef} className="space-y-5">
          {groups.map((group, groupIndex) => (
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
