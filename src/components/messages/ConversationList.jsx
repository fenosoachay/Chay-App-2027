import React, { useState } from "react";
import { MessageCircle, PenSquare, Search } from "lucide-react";
import { isOnline } from "@/hooks/usePresence";
import { usePreferences } from "@/lib/PreferencesContext";
import PullToRefresh from "@/components/PullToRefresh";
import ConversationItem from "@/components/messages/ConversationItem";
import ActiveMembersRow from "@/components/messages/ActiveMembersRow";
import {
  countUnreadMessages,
  isRenderableMessage,
} from "@/lib/messageNotifications";

const FILTER_KEY = "chay_msg_filter";

export default function ConversationList({
  user,
  conversations,
  messagesByConv,
  profiles,
  loading,
  onOpen,
  onNew,
  onRefresh,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(
    () => localStorage.getItem(FILTER_KEY) || "all"
  );
  const { prefs } = usePreferences();
  const showPresence = prefs.presence_visible !== false;
  const profileOf = (uid) => profiles.find((p) => p.created_by_id === uid);

  const items = conversations.map((c) => {
    const isGroup = c.type === "group";
    const msgs = messagesByConv[c.id] || [];
    const last = [...msgs].reverse().find(isRenderableMessage);
    const otherId = !isGroup ? c.participant_ids?.find((id) => id !== user?.id) : null;
    const otherProfile = profileOf(otherId);
    const title = isGroup ? c.name || "Groupe" : otherProfile?.display_name || "Membre";
    const avatar = isGroup ? c.photo_url : otherProfile?.avatar_url;
    const online = showPresence && !isGroup && isOnline(otherProfile?.last_seen_at);
    const unread = countUnreadMessages(msgs, user?.id);
    const preview =
      (last
        ? (last.sender_id === user?.id
            ? "Vous : "
            : isGroup
            ? `${profileOf(last.sender_id)?.display_name || last.sender_name || ""} : `
            : "") + (last.text || (last.image_url ? "📷 Photo" : ""))
        : "") ||
      (isRenderableMessage({ text: c.last_message_text })
        ? c.last_message_text
        : "") ||
      "Démarrez la conversation";
    const time = last?.created_date || c.last_message_at || c.updated_date;
    const pinned = (c.pinned_by || []).includes(user?.id);
    const muted = (c.muted_by || []).includes(user?.id);
    return { c, isGroup, title, avatar, online, unread, preview, time, pinned, muted, msgs };
  });

  const unreadConvCount = items.filter((it) => it.unread > 0).length;

  const q = query.trim().toLowerCase();
  let filtered = q
    ? items.filter(
        (it) =>
          (it.title || "").toLowerCase().includes(q) ||
          (it.preview || "").toLowerCase().includes(q)
      )
    : items;
  if (filter === "unread") filtered = filtered.filter((it) => it.unread > 0);
  if (filter === "group") filtered = filtered.filter((it) => it.isGroup);

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime();
  });

  const setF = (f) => {
    setFilter(f);
    localStorage.setItem(FILTER_KEY, f);
  };

  const Pill = ({ id, label, count }) => (
    <button
      onClick={() => setF(id)}
      className={`px-4 h-9 rounded-full text-sm font-semibold whitespace-nowrap transition ${
        filter === id
          ? "brand-gradient text-white"
          : "border border-border bg-card text-foreground/70"
      } ${id === "unread" && count === 0 ? "opacity-40" : ""}`}
      role="tab"
      aria-selected={filter === id}
    >
      {label}
      {id === "unread" && count > 0 ? ` (${count})` : ""}
    </button>
  );

  return (
    <PullToRefresh mode="window" onRefresh={onRefresh}>
      <div>
        <header className="flex items-center justify-between mb-5">
          <h1 className="font-display font-extrabold text-3xl">
            <span className="brand-gradient-text">Messages</span>
          </h1>
          <button
            onClick={onNew}
            className="h-11 w-11 rounded-full brand-gradient text-white grid place-items-center shadow-sm hover:scale-105 transition"
            aria-label="Nouvelle conversation"
          >
            <PenSquare className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 mb-3">
          <Search className="h-4 w-4 text-foreground/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une conversation ou un message…"
            className="bg-transparent outline-none text-sm font-medium flex-1"
            aria-label="Rechercher une conversation ou un message"
          />
        </div>

        <div className="flex gap-2 mb-3" role="tablist" aria-label="Filtres de conversations">
          <Pill id="all" label="Tout" />
          <Pill id="unread" label="Non lus" count={unreadConvCount} />
          <Pill id="group" label="Groupe" />
        </div>

        {showPresence && (
          <ActiveMembersRow user={user} profiles={profiles} onOpen={onOpen} />
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5">
                <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="h-10 w-10 mx-auto text-foreground/30 mb-3" />
            <p className="text-foreground/50">
              Aucune conversation. Touchez ✏️ pour démarrer un échange.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((it) => (
              <ConversationItem
                key={it.c.id}
                conv={it.c}
                messages={it.msgs}
                user={user}
                title={it.title}
                avatar={it.avatar}
                online={it.online}
                unread={it.unread}
                preview={it.preview}
                query={q}
                time={it.time}
                pinned={it.pinned}
                muted={it.muted}
                onOpen={onOpen}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}