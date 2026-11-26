import React, { useEffect, useRef } from "react";
import { Reply, Copy, Trash2, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useBackHandler } from "@/hooks/useBackHandler";
import { NOMS_REACTIONS, REACTIONS } from "@/lib/reactionsMessages";

export default function MessageActionMenu({
  position,
  mine,
  canEdit,
  onReply,
  onEdit,
  onCopy,
  onDelete,
  onClose,
  onReact,
  maReaction,
}) {
  useBackHandler(true, onClose);
  // 1.3.39 : sur certains Android (Pixel…), l'appui long envoie aussi un « clic droit » et un clic juste
  // APRÈS l'ouverture du menu : ils tombaient sur le fond et refermaient aussitôt le menu (il clignotait).
  // Le fond ne ferme le menu qu'une fois le doigt levé (et au moins 400 ms après l'ouverture).
  const pret = useRef(false);
  useEffect(() => {
    const debut = Date.now();
    let leve = false;
    const t = setTimeout(() => { if (leve) pret.current = true; }, 400);
    const surLeve = () => {
      leve = true;
      const reste = 400 - (Date.now() - debut);
      if (reste <= 0) pret.current = true;
      else setTimeout(() => { pret.current = true; }, reste);
    };
    window.addEventListener("pointerup", surLeve, true);
    window.addEventListener("pointercancel", surLeve, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerup", surLeve, true);
      window.removeEventListener("pointercancel", surLeve, true);
    };
  }, []);
  const fermerSiPret = () => { if (pret.current) onClose(); };
  // 1.3.36 : la barre des 6 réactions (comme Messenger) au-dessus du menu : un peu plus large.
  const left = Math.max(8, Math.min(position.x - 40, window.innerWidth - 300));
  const top = Math.max(8, Math.min(position.y - 64, window.innerHeight - 300));

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={fermerSiPret}
      onContextMenu={(e) => {
        e.preventDefault();
        fermerSiPret();
      }}
    >
      <div
        className="absolute"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
        // Le clic du doigt qui se lève après l'appui long ne choisit rien par accident.
        onClickCapture={(e) => { if (!pret.current) { e.preventDefault(); e.stopPropagation(); } }}
      >
      {onReact && (
        <motion.div
          className="mb-2 flex w-fit items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-xl"
          initial={{ opacity: 0, scale: 0.6, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 30 }}
          style={{ transformOrigin: "20% 100%" }}
          role="toolbar"
          aria-label="Réagir"
        >
          {REACTIONS.map((e, i) => (
            <motion.button
              key={e}
              type="button"
              onClick={() => { onReact(e); onClose(); }}
              initial={{ opacity: 0, y: 14, scale: 0.4 }}
              animate={{ opacity: 1, y: 0, scale: maReaction === e ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 22, delay: 0.03 + i * 0.035 }}
              whileHover={{ scale: 1.35, y: -6 }}
              whileTap={{ scale: 1.5, y: -10 }}
              className={`grid h-11 w-11 place-items-center rounded-full text-[1.75rem] leading-none ${maReaction === e ? "bg-primary/20" : ""}`}
              aria-label={NOMS_REACTIONS[e]}
              aria-pressed={maReaction === e}
            >
              <span aria-hidden="true">{e}</span>
            </motion.button>
          ))}
        </motion.div>
      )}
      <div
        className="rounded-2xl border border-border bg-popover shadow-xl p-1 min-w-[190px] w-fit animate-float-in"
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
    </div>
  );
}