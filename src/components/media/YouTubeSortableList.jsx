import React from "react";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

const thumbOf = (v) =>
  v.cover_url || v.thumbnail_url || `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`;

// Liste glisser-déposer affichée en mode édition.
export default function YouTubeSortableList({ items, onReorder }) {
  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="youtube-order">
        {(drop) => (
          <div ref={drop.innerRef} {...drop.droppableProps} className="space-y-2">
            {items.map((v, index) => (
              <Draggable key={v.id} draggableId={v.id} index={index}>
                {(drag, snap) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    className={`flex items-center gap-3 rounded-2xl border bg-card p-2 transition-shadow ${
                      snap.isDragging ? "border-primary shadow-2xl scale-105" : "border-border"
                    }`}
                  >
                    <span
                      {...drag.dragHandleProps}
                      aria-label="Déplacer"
                      className="grid h-10 w-8 shrink-0 touch-none place-items-center text-foreground/50"
                    >
                      <GripVertical className="h-5 w-5" />
                    </span>
                    <img src={thumbOf(v)} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                    <p className="min-w-0 flex-1 line-clamp-2 text-sm font-bold">{v.title}</p>
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