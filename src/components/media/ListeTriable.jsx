import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import { deplacer } from "@/lib/glisserOrdre";

// Glisser-déposer des listes admin (articles, playlists, sous-playlists, pistes, contenus) : même mécanisme que
// la réorganisation YouTube (@hello-pangea/dnd, poignée touch-none), qui fonctionne au doigt sur Android.
// `actif` = cadenas ouvert : poignée visible et déplacement possible ; sinon, simple liste.
export default function ListeTriable({ id, items, onReorder, renderRow, actif = true, className = "space-y-2", rowClassName = "" }) {
  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    onReorder(deplacer(items, result.source.index, result.destination.index));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={id}>
        {(drop) => (
          <div ref={drop.innerRef} {...drop.droppableProps} className={className}>
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={String(item.id)} index={index} isDragDisabled={!actif}>
                {(drag, snap) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    className={`flex items-center gap-3 rounded-2xl border bg-card p-2 transition-shadow ${
                      snap.isDragging ? "border-primary shadow-2xl scale-105" : "border-border"
                    } ${rowClassName}`}
                  >
                    {actif && (
                      <span
                        {...drag.dragHandleProps}
                        aria-label="Déplacer"
                        className="grid h-10 w-8 shrink-0 touch-none place-items-center text-foreground/50"
                      >
                        <GripVertical className="h-5 w-5" />
                      </span>
                    )}
                    {renderRow(item, index)}
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
