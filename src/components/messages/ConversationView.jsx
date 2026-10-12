import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import {
  ChevronLeft,
  Send,
  Loader2,
  Reply,
  Image as ImageIcon,
  X,
  Smile,
  Settings,
} from "lucide-react";
import Avatar from "@/components/messages/Avatar";
import MessageAvatar from "@/components/messages/MessageAvatar";
import MemberName from "@/components/messages/MemberName";
import useMemberDirectory from "@/hooks/useMemberDirectory";
import { Image } from "@/components/ui/image";
import { isOnline, lastSeenLabel } from "@/hooks/usePresence";
import GroupSettingsSheet from "@/components/messages/GroupSettingsSheet";
import EmojiPicker from "@/components/messages/EmojiPicker";
import MessageActionMenu from "@/components/messages/MessageActionMenu";
import PhotoViewer from "@/components/messages/PhotoViewer";
import ReadReceipts from "@/components/messages/ReadReceipts";
import { isRenderableMessage } from "@/lib/messageNotifications";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { onEnterSubmit } from "@/hooks/useKeyboardShortcuts";
import { enqueue } from "@/lib/offlineQueue";

function fmtTime(d) {
  return formatTimestamp(d, { date: false });
}

export default function ConversationView({
  conversation,
  messages,
  user,
  profiles,
  onBack,
  onRefresh,
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingSent = useRef(false);
  const pressTimer = useRef(null);
  const pressPoint = useRef({ x: 0, y: 0 });

  const { nameOf } = useMemberDirectory();
  const isGroup = conversation?.type === "group";
  const otherId = !isGroup
    ? conversation?.participant_ids?.find((id) => id !== user?.id)
    : null;
  const otherProfile = profiles.find((p) => p.created_by_id === otherId);
  const title = isGroup
    ? conversation?.name || "Groupe"
    : otherProfile?.display_name || "Membre";
  const avatarUrl = isGroup ? conversation?.photo_url : otherProfile?.avatar_url;
  const online = !isGroup && isOnline(otherProfile?.last_seen_at);
  const statusText = isGroup
    ? `${conversation?.participant_ids?.length || 0} membres`
    : lastSeenLabel(otherProfile?.last_seen_at);

  const myName =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Membre";

  // Messenger : à l'ouverture, tout apparaît d'un seul coup — nom en haut,
  // derniers messages et barre d'envoi en bas (saut instantané, sans smooth).
  const anchoredConv = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !conversation?.id) return;
    if (anchoredConv.current !== conversation.id) {
      anchoredConv.current = conversation.id;
      el.scrollTop = el.scrollHeight;
    }
  }, [conversation?.id, messages.length]);

  // Nouveaux messages : on redescend seulement si on était déjà en bas ou si
  // le message vient de nous — sinon l'utilisateur relit l'historique (au
  // dessus) sans être tiré vers le bas.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const mine = !!last && !!user && last.sender_id === user.id;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (mine || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages.length, user?.id]);

  // Mark incoming unread messages as read
  useEffect(() => {
    if (!conversation || !user) return;
    messages.forEach((m) => {
      if (m.sender_id === user.id) return;
      if ((m.read_by || []).includes(user.id)) return;
      base44.entities.Message
        .update(m.id, { read_by: [...(m.read_by || []), user.id] })
        .catch(() => {});
    });
  }, [conversation?.id, messages.length, user?.id]);

  // Signal "conversation ouverte" pour le système anti-notification (MemberProfile).
  useEffect(() => {
    if (!conversation?.id || !user?.id) return;
    let alive = true;

    // `guardAlive` protège uniquement l'écriture "conversation ouverte"
    // (on ne veut pas la reposer après démontage/backgrounding) ; les
    // écritures de nettoyage ("") s'exécutent toujours, comme avant.
    const writeActiveConversationId = (value, guardAlive) => {
      base44.entities.MemberProfile
        .filter({ created_by_id: user.id }, "-created_date", 1)
        .then((rows) => {
          if ((!guardAlive || alive) && rows && rows[0]) {
            base44.entities.MemberProfile
              .update(rows[0].id, { active_conversation_id: value })
              .catch(() => {});
          }
        })
        .catch(() => {});
    };

    writeActiveConversationId(conversation.id, true);

    // Android/iOS : l'app peut passer en arrière-plan (bouton Accueil,
    // verrouillage, changement d'app) sans que ce composant soit démonté —
    // le cleanup React ci-dessous ne s'exécute donc pas alors que
    // l'utilisateur ne regarde plus réellement la conversation. On vide
    // explicitement active_conversation_id dans ce cas pour ne pas bloquer
    // les notifications de l'utilisateur. On ne le restaure PAS
    // automatiquement au retour au premier plan : il faut que l'utilisateur
    // soit réellement de retour sur cet écran (ce useEffect ne se relance
    // que si conversation.id/user.id changent).
    let cancelled = false;
    let appStateHandle = null;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) return;
      writeActiveConversationId("", false);
    }).then((handle) => {
      if (cancelled) handle.remove();
      else appStateHandle = handle;
    }).catch(() => {});

    return () => {
      alive = false;
      cancelled = true;
      appStateHandle?.remove();
      writeActiveConversationId("", false);
    };
  }, [conversation?.id, user?.id]);

  // Typing indicator from conversation realtime
  useEffect(() => {
    const t = conversation?.typing_at
      ? new Date(conversation.typing_at).getTime()
      : 0;
    const active = t > 0 && Date.now() - t < 4000 && conversation.typing_user_id !== user?.id;
    setTyping(active);
    if (active) {
      const remaining = 4000 - (Date.now() - t);
      const to = setTimeout(() => setTyping(false), Math.max(remaining, 500));
      return () => clearTimeout(to);
    }
  }, [conversation?.typing_at, conversation?.typing_user_id, user?.id]);

  const setTypingState = (on) => {
    if (!conversation) return;
    if (on && !isTypingSent.current) {
      isTypingSent.current = true;
      base44.entities.Conversation
        .update(conversation.id, {
          typing_user_id: user.id,
          typing_at: new Date().toISOString(),
        })
        .catch(() => {});
    } else if (!on && isTypingSent.current) {
      isTypingSent.current = false;
      base44.entities.Conversation
        .update(conversation.id, { typing_user_id: null, typing_at: null })
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
    const text = draft.trim();
    if (!text || sending || !conversation) return;
    setSending(true);
    setDraft("");
    setShowEmoji(false);
    clearTimeout(typingTimer.current);
    isTypingSent.current = false;
    setTypingState(false);
    if (!navigator.onLine) {
      enqueue("message", { body: { conversation_id: conversation.id, text, reply_to_id: replyTo?.id || null } });
      setReplyTo(null);
      setSending(false);
      toast({ title: "Message en attente", description: "Il sera envoyé dès que la connexion sera rétablie." });
      return;
    }
    try {
      const result = await base44.functions.invoke("createMessage", {
conversation_id: conversation.id,
text,
reply_to_id: replyTo?.id || null,
});
      if (result?.data?.notification_error) {
        toast({
          title: "Message envoyé",
          description: "La notification du destinataire n'a pas pu être envoyée.",
          variant: "destructive",
        });
      }

      await base44.entities.Conversation.update(conversation.id, {
        last_message_text: text,
        last_message_at: result?.data?.created_date || new Date().toISOString(),
        typing_user_id: null,
        typing_at: null,
      });
      setReplyTo(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setDraft(text);
    }
    setSending(false);
  };

  const sendImage = async (file) => {
    if (!file || !conversation) return;
    setSending(true);
    try {
      const uploadedUrl = await uploadToBase44(file);
      const result = await base44.functions.invoke("createMessage", {
conversation_id: conversation.id,
text: "",
image_url: uploadedUrl,
});
      if (result?.data?.notification_error) {
        toast({
          title: "Photo envoyée",
          description: "La notification du destinataire n'a pas pu être envoyée.",
          variant: "destructive",
        });
      }

      await base44.entities.Conversation.update(conversation.id, {
        last_message_text: "📷 Photo",
        last_message_at: result?.data?.created_date || new Date().toISOString(),
      });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const openPhoto = (m) => {
    const imgs = messages.filter((x) => x.image_url).map((x) => x.image_url);
    const idx = imgs.indexOf(m.image_url);
    setViewer({ images: imgs, index: idx < 0 ? 0 : idx });
  };

  const deleteMessage = async (m) => {
    try {
      await base44.entities.Message.delete(m.id);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const t = editText.trim();
    if (!t) return;
    try {
      await base44.entities.Message.update(editing.id, { text: t });
      setEditing(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // Long-press / right-click to open the action menu
  const openMenuAt = (m, pos) => setMenu({ msg: m, x: pos.x, y: pos.y });
  const onPointerDownMenu = (e, m) => {
    pressPoint.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(
      () => openMenuAt(m, pressPoint.current),
      500
    );
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const onContextMenuMenu = (e, m) => {
    e.preventDefault();
    openMenuAt(m, { x: e.clientX, y: e.clientY });
  };

  // Conversation pas encore chargée : simple indicateur de chargement, sans texte.
  if (!conversation) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Chargement">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const otherParticipants = (conversation.participant_ids || []).filter(
    (id) => id !== user.id
  );
  const readByAll = (m) =>
    otherParticipants.length > 0 &&
    otherParticipants.every((uid) => (m.read_by || []).includes(uid));
  const repliedOf = (id) => messages.find((x) => x.id === id);
  const readersOf = (m) =>
    otherParticipants
      .filter((uid) => (m.read_by || []).includes(uid))
      .map((uid) => profiles.find((p) => p.created_by_id === uid))
      .filter(Boolean);

  // Plein écran façon Messenger : la conversation occupe tout l'écran (nom en
  // haut, derniers messages et barre d'envoi toujours visibles), rendue par
  // portal vers document.body pour échapper aux transformations d'animation
  // de la page (framer-motion) et au décalage du chrome de l'application.
  return createPortal(
<div className="fixed inset-0 z-[55] flex flex-col w-full bg-background overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2.5 bg-background/85 backdrop-blur-xl border-b border-border px-3 py-2.5"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onBack}
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted shrink-0"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <Avatar name={title} src={avatarUrl} size={40} online={online} />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate leading-tight">
            {otherId ? <MemberName userId={otherId} fallback={title} /> : title}
          </div>
          <div className="text-xs text-foreground/50 truncate leading-tight">
            {typing ? (
              <span className="text-primary font-medium">en train d'écrire…</span>
            ) : (
              statusText
            )}
          </div>
        </div>
        {isGroup && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted shrink-0"
            aria-label="Paramètres du groupe"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1 selectable mx-auto w-full max-w-3xl"
      >
        {messages.length === 0 ? (
          <div className="py-16 text-center text-foreground/40 text-sm">
            Aucun message pour le moment. Écrivez le premier !
          </div>
        ) : messages.filter(isRenderableMessage).map((m, i, visibleMessages) => {
          const mine = m.sender_id === user.id;
          const imageOnly = !!m.image_url && !m.text;
          const repliedMessage = m.reply_to_id
            ? repliedOf(m.reply_to_id)
            : null;
          const replied = isRenderableMessage(repliedMessage)
            ? repliedMessage
            : null;
          const prev = visibleMessages[i - 1];
          const next = visibleMessages[i + 1];
          const sameSender = prev && prev.sender_id === m.sender_id;
          const gap = prev
            ? new Date(m.created_date).getTime() -
              new Date(prev.created_date).getTime()
            : Infinity;
          const grouped = sameSender && gap <= 60000;
          const nextSame =
            next && next.sender_id === m.sender_id &&
            new Date(next.created_date).getTime() -
              new Date(m.created_date).getTime() <=
              60000;
          const isLastOfGroup = !nextSame;
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} animate-float-in ${
                grouped ? "mt-0.5" : "mt-2.5"
              }`}
            >
              {!mine && (
                <MessageAvatar
                  profile={profiles.find((p) => p.created_by_id === m.sender_id)}
                  fallbackName={m.sender_name}
                  visible={isLastOfGroup}
                />
              )}
              <div className="max-w-[82%] md:max-w-md">
                {!grouped && (
                  <div
                    className={`text-[0.6875rem] text-foreground/45 mb-1 ${
                      mine ? "text-right" : "text-left"
                    }`}
                  >
                    {fmtTime(m.created_date)}
                  </div>
                )}
                {replied && (
                  <div
                    className={`mb-1 rounded-lg px-2.5 py-1 text-xs border-l-2 ${
                      mine
                        ? "border-white/60 bg-white/10 text-white/70"
                        : "border-primary bg-primary/10 text-foreground/70"
                    }`}
                  >
                    <div className="font-bold">{nameOf(replied.sender_id, replied.sender_name)}</div>
                    {(replied.text || replied.image_url) && (
                      <div className="truncate">
                        {replied.text || "📷 Photo"}
                      </div>
                    )}
                  </div>
                )}
                {editing?.id === m.id && (
                  <div className="rounded-2xl border border-primary/40 bg-card p-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full bg-transparent outline-none text-sm resize-none selectable"
                    />
                    <div className="flex justify-end gap-2 mt-1">
                      <button onClick={() => setEditing(null)} className="px-3 py-1 rounded-full text-xs font-bold border border-border hover:bg-muted">Annuler</button>
                      <button onClick={saveEdit} className="px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground">OK</button>
                    </div>
                  </div>
                )}
                <div
                  onPointerDown={(e) => onPointerDownMenu(e, m)}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onContextMenu={(e) => onContextMenuMenu(e, m)}
                  className={`w-fit max-w-full rounded-2xl cursor-pointer select-none transition active:scale-[0.99] ${editing?.id === m.id ? "hidden" : ""} ${
                    imageOnly
                      ? "p-0 bg-transparent border-0 shadow-none"
                      : `px-4 py-2.5 ${mine ? "brand-gradient text-white rounded-br-md" : "bg-card border border-border rounded-bl-md"} ${grouped ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""}`
                  }`}
                >
                  {isGroup && !mine && !grouped && (
                    <div className="text-xs font-bold text-primary mb-0.5">
                      <MemberName userId={m.sender_id} fallback={m.sender_name} />
                    </div>
                  )}
                  {m.image_url && (
                    <button
                      type="button"
                      onClick={() => openPhoto(m)}
                      className={`block overflow-hidden focus:outline-none ${imageOnly ? "rounded-2xl" : "rounded-xl mb-1"} max-w-[240px] md:max-w-[280px]`}
                      aria-label={`Agrandir la photo envoyée par ${m.sender_name || "Membre"}`}
                    >
                      <Image
                        src={m.image_url}
                        alt={`Photo envoyée par ${m.sender_name || "Membre"}`}
                        fittingType="fill"
                        className="w-full h-48 md:h-56"
                      />
                    </button>
                  )}
                  {m.text ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {m.text}
                    </div>
                  ) : null}
                </div>
                {mine && isLastOfGroup && (
                  <ReadReceipts readers={readersOf(m)} allRead={readByAll(m)} />
                )}
              </div>
            </div>
          );
        })}
        {typing === true && (
          <div className="flex items-center gap-1 px-2 py-1">
            <span
              className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-2 w-2 rounded-full bg-foreground/40 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="border-t border-border bg-muted/50 px-3 py-2 flex items-center gap-2">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-primary">
              {nameOf(replyTo.sender_id, replyTo.sender_name)}
            </div>
            {(replyTo.text || replyTo.image_url) && (
              <div className="text-xs text-foreground/60 truncate">
                {replyTo.text || "📷 Photo"}
              </div>
            )}
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="h-7 w-7 grid place-items-center rounded-full hover:bg-muted"
            aria-label="Annuler la réponse"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Composer */}
      <div
        className="relative z-10 bg-background/95 backdrop-blur-md border-t border-border px-3 py-2 safe-area-pb"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {showEmoji && (
          <div className="absolute bottom-full left-2 right-2 mb-2">
            <EmojiPicker onPick={(em) => setDraft((d) => d + em)} />
          </div>
        )}

        {/* Conteneur Flexible - w-full max-w-3xl garantit qu'il ne déborde jamais */}
        <div className="flex items-center gap-2 w-full max-w-3xl mx-auto">
          
          {/* Bouton Emoji */}
          <button
            onClick={() => setShowEmoji((s) => !s)}
            className={`h-10 w-10 shrink-0 grid place-items-center rounded-full hover:bg-muted transition ${
              showEmoji ? "text-primary bg-muted" : "text-foreground/60"
            }`}
            aria-label="Emojis"
          >
            <Smile className="h-5 w-5" />
          </button>

          {/* Bouton Image */}
          <button
            onClick={() => fileRef.current?.click()}
            className="h-10 w-10 shrink-0 grid place-items-center rounded-full hover:bg-muted text-foreground/60"
            aria-label="Image"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { sendImage(e.target.files?.[0]); e.target.value = ""; }} />

          {/* Champ Texte - min-w-0 EST OBLIGATOIRE POUR ÉVITER LE DÉBORDEMENT */}
          <input
            value={draft}
            onChange={onDraftChange}
            onKeyDown={onEnterSubmit(send)}
            enterKeyHint="send"
            placeholder="Message…"
            className="flex-1 min-w-0 rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary shadow-inner"
          />

          {/* Bouton Envoyer Compact (Icône seule) */}
          <button
            onClick={send}
            disabled={(!draft.trim() && !sending) || sending}
            className="h-10 w-10 shrink-0 grid place-items-center rounded-full brand-gradient text-white disabled:opacity-50 active:scale-95 transition shadow-lg"
            aria-label="Envoyer"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5 ml-0.5" /> 
            )}
          </button>
        </div>
      </div>

      {menu && (
        <MessageActionMenu
          position={{ x: menu.x, y: menu.y }}
          mine={menu.msg.sender_id === user.id}
          canEdit={menu.msg.sender_id === user.id && !!menu.msg.text}
          onReply={() => setReplyTo(menu.msg)}
          onEdit={() => {
            setEditing(menu.msg);
            setEditText(menu.msg.text || "");
          }}
          onCopy={() => {
            if (menu.msg.text)
              navigator.clipboard
                ?.writeText(menu.msg.text)
                .catch(() => {});
          }}
          onDelete={() => deleteMessage(menu.msg)}
          onClose={() => setMenu(null)}
        />
      )}

      {isGroup && (
        <GroupSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          conversation={conversation}
          user={user}
          profiles={profiles}
          onUpdated={onRefresh}
        />
      )}

      {viewer && (
        <PhotoViewer
          images={viewer.images}
          index={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>,
    document.body
  );
}