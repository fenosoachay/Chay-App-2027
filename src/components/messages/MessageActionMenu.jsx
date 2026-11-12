import React from "react";
import { Reply, Copy, Trash2, Pencil } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";

export default function MessageActionMenu({
  position,
  mine,
  canEdit,
  onReply,
  onEdit,
  onCopy,
  onDelete,
  onClose,
}) {
  useBackHandler(true, onClose);
  const left = Math.min(position.x, window.innerWidth - 210);
  const top = Math.min(position.y, window.innerHeight - 220);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute rounded-2xl border border-border bg-popover shadow-xl p-1 min-w-[190px] animate-float-in"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        <button
          onClick={() => {
            onReply();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted text-left"
          role="menuitem"
        >
          <Reply className="h-4 w-4" /> Répondre
        </button>
        <button
          onClick={() => {
            onCopy();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted text-left"
          role="menuitem"
        >
          <Copy className="h-4 w-4" /> Copier
        </button>
        {canEdit && (
          <button
            onClick={() => {
              onEdit();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted text-left"
            role="menuitem"
          >
            <Pencil className="h-4 w-4" /> Modifier
          </button>
        )}
        {mine && (
          <button
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-destructive/10 text-destructive text-left"
            role="menuitem"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
        )}
        <div className="border-t border-border my-1" />
        <div className="px-3 py-1 text-[0.625rem] text-foreground/40">
          Long-appui / clic droit pour les actions
        </div>
      </div>
    </div>
  );
}