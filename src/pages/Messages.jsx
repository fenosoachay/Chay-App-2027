import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { usePresenceHeartbeat, useProfiles } from "@/hooks/usePresence";
import { usePreferences } from "@/lib/PreferencesContext";
import { setActiveChat } from "@/lib/activeChat";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { MessageCircle } from "lucide-react";
import ConversationList from "@/components/messages/ConversationList";
import ConversationView from "@/components/messages/ConversationView";
import NewChatSheet from "@/components/messages/NewChatSheet";
import {
  groupMessagesByConversation,
  isRenderableMessage,
} from "@/lib/messageNotifications";

export default function Messages() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeId = searchParams.get("c");
  const [conversations, setConversations] = useState([]);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("chay_chat_banner") === "1"
  );

  const { prefs } = usePreferences();
  usePresenceHeartbeat(user, prefs.presence_visible !== false);
  const profiles = useProfiles();

  const loadAll = async () => {
    const [convos, msgs] = await Promise.all([
      base44.entities.Conversation.list("-updated_date", 100).catch(() => []),
      base44.entities.Message.list("-created_date", 500).catch((error) => {
        console.error("[Messages] Impossible de charger les messages récents.", error);
        return [];
      }),
    ]);
    const cArr = Array.isArray(convos) ? convos : [];
    const mArr = Array.isArray(msgs) ? msgs : [];
    setConversations(cArr);
    setMessagesByConv(groupMessagesByConversation(mArr));
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 5000);
    return () => clearInterval(t);
  }, []);

  // Realtime updates
  useEffect(() => {
    const unsubC = base44.entities.Conversation.subscribe((event) => {
      setConversations((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        if (event.type === "delete") map.delete(event.data.id);
        else map.set(event.data.id, event.data);
        return Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.last_message_at || b.updated_date || 0).getTime() -
            new Date(a.last_message_at || a.updated_date || 0).getTime()
        );
      });
    });
    const unsubM = base44.entities.Message.subscribe((event) => {
      const m = event.data;
      if (!m?.conversation_id) return;
      if (event.type !== "delete" && !isRenderableMessage(m)) {
        setMessagesByConv((prev) => {
          const existing = prev[m.conversation_id] || [];
          return {
            ...prev,
            [m.conversation_id]: existing.filter((message) => message.id !== m.id),
          };
        });
        return;
      }
      setMessagesByConv((prev) => {
        const list = prev[m.conversation_id] ? [...prev[m.conversation_id]] : [];
        const idx = list.findIndex((x) => x.id === m.id);
        if (event.type === "delete") {
          if (idx >= 0) list.splice(idx, 1);
        } else if (idx >= 0) {
          list[idx] = m;
        } else {
          list.push(m);
          list.sort(
            (a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
          );
        }
        return { ...prev, [m.conversation_id]: list };
      });
    });
    return () => {
      unsubC();
      unsubM();
    };
  }, []);

  const activeConv = conversations.find((c) => c.id === activeId) || null;

  useEffect(() => {
    if (activeConv && user) {
      const isGroup = activeConv.type === "group";
      const otherId = !isGroup
        ? activeConv.participant_ids?.find((id) => id !== user.id)
        : null;
      const otherProfile = profiles.find((p) => p.created_by_id === otherId);
      setActiveChat({
        id: activeConv.id,
        title: isGroup ? activeConv.name || "Groupe" : otherProfile?.display_name || "Membre",
        avatar: isGroup ? activeConv.photo_url : otherProfile?.avatar_url,
        isGroup,
      });
    }
  }, [activeConv?.id, user?.id, profiles]);

  const openConversation = (id) =>
    setSearchParams({ c: id }, { state: { chayConversation: true } });
  const goBack = () => {
    if (hasNavigationOrigin(window.history.state, "chayConversation")) navigate(-1);
    else setSearchParams({}, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-4 md:py-8">
      {!activeId && !bannerDismissed && (
        <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80 flex-1">
            Le chat public a été remplacé par les Messages. Retrouvez vos
            conversations privées et vos groupes ici.
          </p>
          <button
            onClick={() => {
              localStorage.setItem("chay_chat_banner", "1");
              setBannerDismissed(true);
            }}
            className="shrink-0 rounded-full brand-gradient text-white px-4 py-1.5 text-xs font-bold"
          >
            J'ai compris
          </button>
        </div>
      )}
      {activeId && !activeConv && !loading ? (
        <div className="py-20 text-center text-foreground/50">
          Conversation introuvable.
        </div>
      ) : activeId ? (
        <ConversationView
          key={activeId}
          conversation={activeConv}
          messages={messagesByConv[activeId] || []}
          user={user}
          profiles={profiles}
          onBack={goBack}
          onRefresh={loadAll}
        />
      ) : (
        <ConversationList
          user={user}
          conversations={conversations}
          messagesByConv={messagesByConv}
          profiles={profiles}
          loading={loading}
          onOpen={openConversation}
          onNew={() => setNewOpen(true)}
          onRefresh={loadAll}
        />
      )}

      <NewChatSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        user={user}
        profiles={profiles}
        conversations={conversations}
        onCreated={openConversation}
      />
    </div>
  );
}