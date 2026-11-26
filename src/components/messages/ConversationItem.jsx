import React, { useEffect, useRef, useState } from "react";
import {
  Pin,
  PinOff,
  CheckCheck,
  BellOff,
  Bell,
  Trash2,
  MoreVertical,
} from "lucide-react";
import Avatar from "@/components/messages/Avatar";
import { base44 } from "@/api/base44Client";
import { relTime } from "@/hooks/usePresence";
import { isRenderableMessage } from "@/lib/messageNotifications";

const dateMessage = (m) => String(m.created_date || m.created || "");

const Highlight = ({ text, q }) => {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
};

export default function ConversationItem({
  conv,
  messages,
  user,
  title,
  avatar,
  online,
  unread,
  preview,
  time,
  pinned,
  muted,
  vus = [],
  onOpen,
  onRefresh,
  query,
}) {
  const [menu, setMenu] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [fading, setFading] = useState(false);
  const prevUnread = useRef(unread);
  const longTimer = useRef(null);

  // Fade doux quand la conversation passe de non lue à lue.
  useEffect(() => {
    if (prevUnread.current > 0 && unread === 0) {
      setFading(true);
      const t = setTimeout(() => setFading(false), 500);
      prevUnread.current = unread;
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
  }, [unread]);

  // Ferme le menu avec Échap.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const openAt = (x, y) => {
    setMenu({
      x: Math.min(x ?? window.innerWidth - 210, window.innerWidth - 210),
      y: Math.min(y ?? 80, window.innerHeight - 260),
    });
  };

  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    longTimer.current = setTimeout(() => openAt(t?.clientX, t?.clientY), 500);
  };
  const cancelLong = () => clearTimeout(longTimer.current);

  const togglePin = async () => {
    const arr = conv.pinned_by || [];
    const next = arr.includes(user.id)
      ? arr.filter((id) => id !== user.id)
      : [...arr, user.id];
    await base44.entities.Conversation.update(conv.id, { pinned_by: next }).catch(() => {});
    setMenu(null);
    onRefresh?.();
  };
  const toggleMute = async () => {
    const arr = conv.muted_by || [];
    const next = arr.includes(user.id)
      ? arr.filter((id) => id !== user.id)
      : [...arr, user.id];
    await base44.entities.Conversation.update(conv.id, { muted_by: next }).catch(() => {});
    setMenu(null);
    onRefresh?.();
  };
  const markRead = async () => {
    const targets = (messages || []).filter(
      (m) => m.sender_id !== user.id && !(m.read_by || []).includes(user.id)
    );
    if (targets.length) {
      await base44.entities.Message.bulkUpdate(
        targets.map((m) => ({ id: m.id, read_by: [...(m.read_by || []), user.id] }))
      ).catch(() => {});
    }
    setMenu(null);
    onRefresh?.();
  };
  // 1.3.34 : « non lu » ne touche que le dernier message reçu (avant : tous les messages lus de la
  // conversation repassaient en non lus, ce qui faisait un gros compteur pour une seule personne).
  const markUnread = async () => {
    const recus = (messages || []).filter((m) => m.sender_id !== user.id && isRenderableMessage(m));
    const dernier = recus.reduce((a, m) => (!a || dateMessage(m) >= dateMessage(a) ? m : a), null);
    const targets = dernier && (dernier.read_by || []).includes(user.id) ? [dernier] : [];
    if (targets.length) {
      await base44.entities.Message.bulkUpdate(
        targets.map((m) => ({
          id: m.id,
          read_by: (m.read_by || []).filter((id) => id !== user.id),
        }))
      ).catch(() => {});
    }
    setMenu(null);
    onRefresh?.();
  };
  const del = async () => {
    await base44.entities.Conversation.delete(conv.id).catch(() => {});
    setConfirmDel(false);
    setMenu(null);
    onRefresh?.();
  };

  const MenuItem = ({ icon: Icon, label, onClick, danger }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left hover:bg-muted transition ${
        danger ? "text-destructive" : "text-foreground/80"
      }`}
      role="menuitem"
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
  );

  return (
    <>
      <div
        className="group relative w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-muted transition text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onOpen(conv.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          openAt(e.clientX, e.clientY);
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelLong}
        onTouchMove={cancelLong}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(conv.id);
        }}
        aria-label={`Conversation ${title}${unread ? `, ${unread} non lu${unread > 1 ? "s" : ""}` : ""}`}
      >
        <Avatar name={title} src={avatar} size={48} online={online} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-[0.9375rem] transition-opacity duration-500 ${
                unread ? "font-semibold" : "font-medium"
              } ${fading ? "opacity-60" : "opacity-100"}`}
            >
              {pinned && (
                <Pin className="inline h-3.5 w-3.5 mr-1 text-primary align-text-bottom" />
              )}
              <Highlight text={title} q={query} />
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {unread > 0 && (
                <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              )}
              <span className="text-xs text-foreground/45">{relTime(time)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span
              className={`text-sm truncate transition-opacity duration-500 ${
                unread ? "font-semibold text-foreground/80" : "text-foreground/55"
              } ${fading ? "opacity-60" : ""}`}
            >
              <Highlight text={preview} q={query} />
            </span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-bold h-5 min-w-[1.25rem] px-1 grid place-items-center">
                {unread}
              </span>
            )}
            {/* 1.3.43 : « Vu » comme Messenger : la photo de ceux qui ont lu mon dernier message (3 au plus). */}
            {!unread && vus.length > 0 && (
              <span
                className="flex shrink-0 items-center -space-x-1.5"
                aria-label={`Vu par ${vus.map((v) => v.nom).join(", ")}`}
                title={`Vu par ${vus.map((v) => v.nom).join(", ")}`}
              >
                {vus.slice(0, 3).map((v) => (
                  <span key={v.id} className="rounded-full ring-2 ring-background">
                    <Avatar name={v.nom} src={v.photo} size={16} />
                  </span>
                ))}
                {vus.length > 3 && (
                  <span className="grid h-4 min-w-[1rem] place-items-center rounded-full bg-muted px-0.5 text-[0.5625rem] font-bold text-foreground/70 ring-2 ring-background">
                    +{vus.length - 3}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            openAt(window.innerWidth - 210, r.top);
          }}
          className="hidden md:grid h-9 w-9 place-items-center rounded-full hover:bg-muted/70 opacity-0 group-hover:opacity-100 transition shrink-0"
          aria-label="Options de la conversation"
        >
          <MoreVertical className="h-4 w-4 text-foreground/60" />
        </button>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-52 rounded-2xl border border-border bg-popover shadow-xl overflow-hidden"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
          >
            <MenuItem
              icon={pinned ? PinOff : Pin}
              label={pinned ? "Désépingler" : "Épingler"}
              onClick={togglePin}
            />
            <MenuItem
              icon={CheckCheck}
              label={unread ? "Marquer comme lu" : "Marquer comme non lu"}
              onClick={unread ? markRead : markUnread}
            />
            <MenuItem
              icon={muted ? Bell : BellOff}
              label={muted ? "Activer les notifications" : "Mettre en sourdine"}
              onClick={toggleMute}
            />
            <div className="h-px bg-border" />
            <MenuItem icon={Trash2} label="Supprimer" danger onClick={() => setConfirmDel(true)} />
          </div>
        </>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-background border border-border p-5 shadow-2xl">
            <p className="font-display font-bold text-lg">Supprimer cette conversation ?</p>
            <p className="text-sm text-foreground/60 mt-1">Cette action est définitive.</p>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setConfirmDel(false)}
                className="px-4 py-2 rounded-full text-sm font-semibold border border-border hover:bg-muted"
              >
                Annuler
              </button>
              <button
                onClick={del}
                className="px-4 py-2 rounded-full text-sm font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
