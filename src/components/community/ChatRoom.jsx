import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2 } from "lucide-react";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { onEnterSubmit } from "@/hooks/useKeyboardShortcuts";
import MemberName from "@/components/messages/MemberName";
import useMemberDirectory from "@/hooks/useMemberDirectory";

function fmtTime(d) {
  return formatTimestamp(d, { date: false });
}
function initial(name) {
  return (name || "?")[0]?.toUpperCase();
}

export default function ChatRoom({ user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [presence, setPresence] = useState([]);
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const myPresenceId = useRef(null);
  const typingTimer = useRef(null);
  const isTypingSent = useRef(false);

  const { nameOf } = useMemberDirectory();
  const myName =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    (user?.email ? user.email.split("@")[0] : "Membre");

  // Messages + realtime
  useEffect(() => {
    (async () => {
      const msgs = await base44.entities.ChatMessage
        .list("created_date", 100)
        .catch(() => []);
      setMessages(Array.isArray(msgs) ? msgs : []);
      setLoading(false);
    })();
    const unsub = base44.entities.ChatMessage.subscribe((event) => {
      if (event.type === "create") {
        setMessages((m) =>
          m.some((x) => x.id === event.data.id) ? m : [...m, event.data]
        );
      }
    });
    return unsub;
  }, []);

  // Presence: ensure record, heartbeat, subscribe to others
  useEffect(() => {
    let stopped = false;
    let interval = null;
    const ensure = async () => {
      const existing = await base44.entities.ChatPresence
        .filter({ created_by_id: user.id }, "-created_date", 1)
        .catch(() => []);
      if (existing && existing[0]) {
        myPresenceId.current = existing[0].id;
        return;
      }
      const c = await base44.entities.ChatPresence
        .create({ display_name: myName, last_seen_at: new Date().toISOString() })
        .catch(() => null);
      myPresenceId.current = c?.id || null;
    };
    const beat = () => {
      if (myPresenceId.current)
        base44.entities.ChatPresence
          .update(myPresenceId.current, {
            last_seen_at: new Date().toISOString(),
            display_name: myName,
          })
          .catch(() => {});
    };
    (async () => {
      await ensure();
      if (stopped) return;
      beat();
      interval = setInterval(beat, 25000);
    })();
    base44.entities.ChatPresence
      .list("-last_seen_at", 50)
      .then((all) =>
        setPresence((Array.isArray(all) ? all : []).filter((p) => p.created_by_id !== user.id))
      )
      .catch(() => {});
    const unsub = base44.entities.ChatPresence.subscribe((event) => {
      setPresence((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        if (event.type === "delete") map.delete(event.data.id);
        else if (event.data.created_by_id !== user.id)
          map.set(event.data.id, event.data);
        return Array.from(map.values());
      });
    });
    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      unsub();
    };
  }, [user?.id]);

  // Typing detection from others' presence
  useEffect(() => {
    const now = Date.now();
    const typers = presence.filter(
      (p) => p.typing_at && now - new Date(p.typing_at).getTime() < 4000
    );
    setTyping(typers.length > 0);
    if (typers.length > 0) {
      const earliest = Math.min(...typers.map((p) => new Date(p.typing_at).getTime()));
      const to = setTimeout(() => setTyping(false), Math.max(4000 - (now - earliest), 500));
      return () => clearTimeout(to);
    }
  }, [presence]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const setTypingState = (on) => {
    if (!myPresenceId.current) return;
    if (on && !isTypingSent.current) {
      isTypingSent.current = true;
      base44.entities.ChatPresence
        .update(myPresenceId.current, { typing_at: new Date().toISOString() })
        .catch(() => {});
    } else if (!on && isTypingSent.current) {
      isTypingSent.current = false;
      base44.entities.ChatPresence
        .update(myPresenceId.current, { typing_at: null })
        .catch(() => {});
    }
  };

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    setTypingState(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingState(false), 2500);
  };

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    clearTimeout(typingTimer.current);
    isTypingSent.current = false;
    setTypingState(false);
    try {
      await base44.entities.ChatMessage.create({
        room_id: "general",
        text,
        author_name: myName,
      });
    } catch {
      setDraft(text);
    }
    setSending(false);
  };

  const now = Date.now();
  const isSeen = (m) =>
    presence.some(
      (p) =>
        p.last_seen_at &&
        new Date(p.last_seen_at).getTime() >= new Date(m.created_date).getTime()
    );
  const typerNames = presence
    .filter((p) => p.typing_at && now - new Date(p.typing_at).getTime() < 4000)
    .map((p) => nameOf(p.created_by_id, p.display_name || "Quelqu'un"));

  return (
    <div>
      <h2 className="font-display font-extrabold text-lg mb-4">Chat en direct</h2>
      <div className="rounded-[1.5rem] border border-border bg-card overflow-hidden flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 no-scrollbar">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-foreground/50 py-10 text-sm">
              Soyez le premier à écrire un mot d'encouragement !
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.created_by_id ? m.created_by_id === user?.id : m.author_name === myName;
              return (
                <div
                  key={m.id}
                  className={`flex gap-2 max-w-[85%] ${
                    mine ? "self-end flex-row-reverse" : "self-start"
                  }`}
                >
                  {!mine && (
                    <div className="h-8 w-8 rounded-full brand-gradient grid place-items-center text-white font-bold text-xs shrink-0">
                      {initial(nameOf(m.created_by_id, m.author_name))}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words ${
                        mine
                          ? "brand-gradient text-white rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {!mine && (
                        <div className="text-xs font-bold text-primary mb-0.5">
                          <MemberName userId={m.created_by_id} fallback={m.author_name} />
                        </div>
                      )}
                      {m.text}
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 flex items-center gap-1 text-muted-foreground ${
                        mine ? "justify-end" : ""
                      }`}
                    >
                      {fmtTime(m.created_date)}
                      {mine &&
                        (isSeen(m) ? (
                          <>
                            <span>·</span>
                            <span className="text-primary font-semibold">Vu</span>
                          </>
                        ) : (
                          <span className="opacity-60">· Envoyé</span>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {typing && (
            <div className="flex items-center gap-2 self-start">
              <div className="h-8 w-8 rounded-full brand-gradient grid place-items-center text-white font-bold text-xs shrink-0">
                …
              </div>
              <div className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-foreground/60 italic">
                {typerNames[0] || "Quelqu'un"}
                {typerNames.length > 1 ? ` et ${typerNames.length - 1} autre(s) ` : " "}
                écrit…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2 bg-background/60">
          <input
            value={draft}
            onChange={onDraftChange}
            onKeyDown={onEnterSubmit(send)}
            enterKeyHint="send"
            placeholder="Écrivez un message…"
            className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            className="h-11 w-11 grid place-items-center rounded-full brand-gradient text-white hover:scale-105 transition disabled:opacity-50 shrink-0"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}