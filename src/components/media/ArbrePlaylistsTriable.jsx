import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import { deplacer } from "@/lib/glisserOrdre";

// Playlists et sous-playlists triables (admin) : même mécanisme que la réorganisation YouTube
// (@hello-pangea/dnd, poignée touch-none). UN seul DragDropContext (les contextes imbriqués ne sont pas pris en
// charge) ; une zone de dépôt par niveau, typée : une sous-playlist ne peut pas sortir de sa playlist.
function Poignee({ drag, actif }) {
  if (!actif) return null;
  return (
    <span {...drag.dragHandleProps} aria-label="Déplacer" className="grid h-10 w-8 shrink-0 touch-none place-items-center text-foreground/50">
      <GripVertical className="h-5 w-5" />
    </span>
  );
}

export default function ArbrePlaylistsTriable({ arbre, actif, deplies, onReorderRacines, onReorderSous, renderPlaylist, renderSous, renderVide }) {
  const onDragEnd = (r) => {
    if (!r.destination || r.destination.droppableId !== r.source.droppableId || r.destination.index === r.source.index) return;
    if (r.source.droppableId === "racines") {
      onReorderRacines(deplacer(arbre, r.source.index, r.destination.index));
      return;
    }
    const parent = arbre.find((p) => `sous-${p.id}` === r.source.droppableId);
    if (parent) onReorderSous(deplacer(parent.sous, r.source.index, r.destination.index));
  };
  const ligne = (snap) => `flex items-center gap-3 rounded-2xl border bg-card p-2 transition-shadow ${
    snap.isDragging ? "border-primary shadow-2xl scale-105" : "border-border"
  }`;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="racines" type="racine">
        {(drop) => (
          <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-2">
            {arbre.map((p, index) => (
              <Draggable key={p.id} draggableId={`p-${p.id}`} index={index} isDragDisabled={!actif}>
                {(drag, snap) => (
                  <div ref={drag.innerRef} {...drag.draggableProps}>
                    <div className={ligne(snap)}>
                      <Poignee drag={drag} actif={actif} />
                      {renderPlaylist(p)}
                    </div>
                    {deplies.has(p.id) && (
                      <Droppable droppableId={`sous-${p.id}`} type={`sous-${p.id}`}>
                        {(dropSous) => (
                          <div ref={dropSous.innerRef} {...dropSous.droppableProps} className="mt-2 ml-8 space-y-2">
                            {p.sous.length === 0 && renderVide(p)}
                            {p.sous.map((sp, i) => (
                              <Draggable key={sp.id} draggableId={`s-${sp.id}`} index={i} isDragDisabled={!actif}>
                                {(dragSous, snapSous) => (
                                  <div ref={dragSous.innerRef} {...dragSous.draggableProps} className={ligne(snapSous)}>
                                    <Poignee drag={dragSous} actif={actif} />
                                    {renderSous(sp, p)}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {dropSous.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {drop.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
