import React, { useEffect, useMemo, useState, useCallback } from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical, Lock, Unlock, Music, Play, Pause, Trash2 } from "lucide-react";
import { groupMusicFavorites } from "@/lib/favoritePlaylists";
import { appliquerOrdre, deplacer } from "@/lib/glisserOrdre";

// Glisser-déposer : même mécanisme que la réorganisation des vidéos YouTube côté admin
// (YouTubeSortableList, @hello-pangea/dnd), qui fonctionne au doigt sur Android.
function FavoriteGroup({
  group,
  locked,
  onReorderItems,
  currentTrack,
  isPlaying,
  playPlaylistItem,
  removeFromPlaylist,
}) {
  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    onReorderItems(group, deplacer(group.items, result.source.index, result.destination.index));
  };
  const peutGlisser = !locked && group.items.length > 1;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Music className="h-4 w-4 text-primary" />
        <h3 className="font-bold">{group.name}</h3>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={`favoris-${group.id}`}>
          {(drop) => (
            <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-2">
              {group.items.map((item, index) => (
                <Draggable key={item.id} draggableId={String(item.id)} index={index} isDragDisabled={!peutGlisser}>
                  {(drag, snap) => (
                    <div
                      ref={drag.innerRef}
                      {...drag.draggableProps}
                      className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-shadow ${
                        snap.isDragging ? "border-primary shadow-2xl scale-105" : "border-border/70"
                      }`}
                    >
                      {peutGlisser && (
                        <span
                          {...drag.dragHandleProps}
                          aria-label={`Déplacer ${item.title}`}
                          className="grid h-10 w-8 shrink-0 touch-none place-items-center text-foreground/50"
                        >
                          <GripVertical className="h-5 w-5" />
                        </span>
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
                  )}
                </Draggable>
              ))}
              {drop.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
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

  const handleReorderGroupItems = useCallback((group, nextItems) => {
    // Tous les titres du groupe (un seul groupe « Favoris ») reçoivent leur nouveau rang, puis
    // Media.reorderFavoriteItems l'enregistre (champ `order` de chaque PlaylistItem).
    setOrderedItems((items) => appliquerOrdre(items, nextItems, "order"));
    onReorderItems?.(group.id, nextItems);
  }, [onReorderItems]);

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
        <div className="space-y-5">
          {groups.map((group) => (
            <FavoriteGroup
              key={group.id}
              group={group}
              locked={locked}
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
