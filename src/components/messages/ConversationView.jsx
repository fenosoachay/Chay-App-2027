import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { createActiveConversationSync } from "@/lib/activeConversationSync";
import { base44 } from "@/api/base44Client";
import { envoyerPieceJointe, uploadToBase44, SEUIL_UPLOAD_DIRECT } from "@/lib/upload";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import {
  ChevronLeft,
  Send,
  Loader2,
  Reply,
  Image as ImageIcon,
  X,
  Smile,
  Camera,
  Info,
  Plus,
  RotateCw,
} from "lucide-react";
import MenuPlus from "@/components/messages/MenuPlus";
import PieceJointeBulle from "@/components/messages/PieceJointeBulle";
import { BarreEnregistrement, BoutonMicro, EnvoyerVocal, useEnregistreur } from "@/components/messages/EnregistreurVocal";
import { BulleEcrit, CSS_MESSAGES, StatutEnTete, VuPar } from "@/components/messages/animationsMessages";
import { positionsVu } from "@/lib/vuMessages";
import FondSection from "@/components/FondSection";
import useSombre from "@/hooks/useSombre";
import { apercuPiece, aPieceJointe, genreFichier, MAX_PIECE_OCTETS } from "@/lib/piecesJointes";
import Avatar from "@/components/messages/Avatar";
import MessageAvatar from "@/components/messages/MessageAvatar";
import MemberName from "@/components/messages/MemberName";
import useMemberDirectory from "@/hooks/useMemberDirectory";
import { Image } from "@/components/ui/image";
import { isOnline, lastSeenLabel } from "@/hooks/usePresence";
import EmojiPicker from "@/components/messages/EmojiPicker";
import MessageActionMenu from "@/components/messages/MessageActionMenu";
import PhotoViewer from "@/components/messages/PhotoViewer";
import PhotoEditeur from "@/components/messages/PhotoEditeur";
import TexteAvecLiens from "@/components/messages/TexteAvecLiens";
import InfosConversation from "@/components/messages/InfosConversation";
import { ChayConversation, estNatif } from "@/lib/chayConversation";
import { isRenderableMessage } from "@/lib/messageNotifications";
import { formatTimestamp } from "@/lib/formatTimestamp";
import { enqueue } from "@/lib/offlineQueue";
import { envoyerMessageTexte } from "@/lib/messageSend";

function fmtTime(d) {
  return formatTimestamp(d, { date: false });
}

const LIKE = "👍";

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
  const [infosOuvertes, setInfosOuvertes] = useState(false);
  const [surligne, setSurligne] = useState(null); // message trouvé par la recherche (mis en évidence)
  const [menu, setMenu] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const champRef = useRef(null);
  // Photo choisie (galerie ou appareil photo) : modifiée (pivoter, recadrer) avant l'envoi.
  const [photoAEditer, setPhotoAEditer] = useState(null);
  const typingTimer = useRef(null);
  const isTypingSent = useRef(false);
  const pressTimer = useRef(null);
  const pressPoint = useRef({ x: 0, y: 0 });
  // 1.3.35 : « + » (fichiers), message vocal, envois en cours (barre de progression dans la bulle).
  const [menuPlus, setMenuPlus] = useState(false);
  const [envois, setEnvois] = useState([]);
  const [glisse, setGlisse] = useState(0);
  const controleurs = useRef({});
  // Seuls les messages arrivés après l'ouverture de la conversation s'animent (pas tout l'historique).
  const ouvertLe = useRef(Date.now());
  useEffect(() => { ouvertLe.current = Date.now(); }, [conversation?.id]);

  const { nameOf, prenomOf } = useMemberDirectory();
  // 1.3.35 : en groupe, les membres sont désignés par leur prénom seul.
  const nomCourt = (uid, fallback) => (isGroup ? prenomOf(uid, fallback) : nameOf(uid, fallback));
  const sombre = useSombre();
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
  // Compte automatique « Chay » (1.3.22) : messages automatiques, on ne peut pas y répondre.
  const automatique = !isGroup && Boolean(otherProfile?.systeme);
  const statusText = isGroup
    ? `${conversation?.participant_ids?.length || 0} membres`
    : automatique
      ? "Messages automatiques"
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

  // Signal "conversation ouverte" pour le système anti-notification (MemberProfile.active_conversation_id) :
  // le serveur ne notifie pas un destinataire en ligne qui a la conversation ouverte. Il faut donc la vider dès
  // que l'utilisateur ne la regarde plus, et la remettre à son retour sur cet écran :
  //  - web : onglet en arrière-plan / page masquée (visibilitychange, pagehide), retour (visibilitychange, pageshow) ;
  //  - APK : app en arrière-plan / au premier plan (appStateChange de @capacitor/app) ;
  //  - sortie de la conversation (démontage) : toujours vidée.
  // Écritures dédupliquées et faites une par une (src/lib/activeConversationSync.js).
  useEffect(() => {
    if (!conversation?.id || !user?.id) return;

    const writeActiveConversationId = (value) =>
      base44.entities.MemberProfile
        .filter({ created_by_id: user.id }, "-created_date", 1)
        .then((rows) => (rows && rows[0]
          ? base44.entities.MemberProfile.update(rows[0].id, { active_conversation_id: value })
          : null));

    const sync = createActiveConversationSync(conversation.id, writeActiveConversationId);
    const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    if (isHidden()) sync.hidden();
    else sync.visible();

    const onVisibilityChange = () => (isHidden() ? sync.hidden() : sync.visible());
    const onPageHide = () => sync.hidden();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onVisibilityChange);

    let cancelled = false;
    let appStateHandle = null;
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) sync.visible();
      else sync.hidden();
    }).then((handle) => {
      if (cancelled) handle.remove();
      else appStateHandle = handle;
    }).catch(() => {});

    return () => {
      cancelled = true;
      appStateHandle?.remove();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onVisibilityChange);
      sync.dispose();
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
  // Conversation ouverte (et à chaque nouveau message) : sa notification Android est retirée.
  useEffect(() => {
    if (!conversation?.id || !estNatif()) return;
    ChayConversation.effacer({ conversation: conversation.id }).catch(() => {});
  }, [conversation?.id, messages.length]);

  // Message envoyé (champ vidé) : le champ reprend sa hauteur d'une ligne.
  useEffect(() => {
    if (!draft && champRef.current) champRef.current.style.height = "auto";
  }, [draft]);

  // `force` : texte envoyé sans passer par le champ (bouton 👍 quand le champ est vide).
  const send = async (force) => {
    const text = typeof force === "string" ? force : draft.trim();
    if (!text || sending || !conversation) return;
    setSending(true);
    if (typeof force !== "string") setDraft("");
    setShowEmoji(false);
    clearTimeout(typingTimer.current);
    isTypingSent.current = false;
    setTypingState(false);
    try {
      // Envoi toujours tenté (navigator.onLine n'est pas fiable dans la WebView Android) ;
      // file d'attente seulement en cas d'échec réseau réel.
      const envoi = await envoyerMessageTexte({
        invoke: (name, data) => base44.functions.invoke(name, data),
        updateConversation: (id, patch) => base44.entities.Conversation.update(id, patch),
        enqueue,
      }, { conversation_id: conversation.id, text, reply_to_id: replyTo?.id || null });
      if (envoi.statut === "en-attente") {
        toast({ title: "Message en attente", description: "Connexion indisponible : il sera envoyé dès qu'elle sera rétablie." });
      } else if (envoi.result?.data?.notification_error) {
        toast({
          title: "Message envoyé",
          description: "La notification du destinataire n'a pas pu être envoyée.",
          variant: "destructive",
        });
      }
      setReplyTo(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      if (typeof force !== "string") setDraft(text);
    }
    setSending(false);
  };

  const sendImage = async (photo) => {
    if (!photo || !conversation) return;
    // Photo modifiée (Blob) : redevient un fichier nommé pour l'envoi.
    const file = photo instanceof File ? photo : new File([photo], `photo_${Date.now()}.jpg`, { type: photo.type || "image/jpeg" });
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

  // 1.3.35 : pièce jointe (vocal, vidéo, audio, document, fichier) : envoyée vers R2 avec une bulle de
  // progression, puis le message est créé. Annulable ; en cas d'échec, « Réessayer ».
  const majEnvoi = (cle, patch) => setEnvois((l) => l.map((x) => (x.cle === cle ? { ...x, ...patch } : x)));
  const envoyerPiece = async (file, { vocal = false, duree = null, cle: cleExistante } = {}) => {
    if (!conversation) return;
    if (file.size > MAX_PIECE_OCTETS) {
      toast({ title: "Fichier trop volumineux", description: `${file.name} dépasse 500 Mo.`, variant: "destructive" });
      return;
    }
    const cle = cleExistante || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const genre = vocal ? "vocal" : genreFichier(file);
    const ctrl = new AbortController();
    controleurs.current[cle] = ctrl;
    if (cleExistante) majEnvoi(cle, { progres: 0, erreur: null });
    else setEnvois((l) => [...l, { cle, file, vocal, duree, genre, nom: file.name, taille: file.size, progres: 0, erreur: null }]);
    const reponse = replyTo?.id || null;
    setReplyTo(null);
    try {
      const url = await envoyerPieceJointe(file, { signal: ctrl.signal, onProgress: (p) => majEnvoi(cle, { progres: p }) });
      const result = await base44.functions.invoke("createMessage", {
        conversation_id: conversation.id,
        text: "",
        piece_jointe: { url, vocal, duree },
        reply_to_id: reponse,
      });
      const pj = result?.data?.piece_jointe || { genre, nom: file.name };
      await base44.entities.Conversation.update(conversation.id, {
        last_message_text: apercuPiece(pj),
        last_message_at: result?.data?.created_date || new Date().toISOString(),
      }).catch(() => {});
      setEnvois((l) => l.filter((x) => x.cle !== cle));
    } catch (e) {
      if (e?.cancelled || ctrl.signal.aborted) setEnvois((l) => l.filter((x) => x.cle !== cle));
      else majEnvoi(cle, { erreur: e?.message || "Échec de l'envoi" });
    } finally {
      delete controleurs.current[cle];
    }
  };
  const annulerEnvoi = (cle) => {
    controleurs.current[cle]?.abort();
    setEnvois((l) => l.filter((x) => x.cle !== cle));
  };
  const reessayer = (x) => envoyerPiece(x.file, { vocal: x.vocal, duree: x.duree, cle: x.cle });

  // « + » : une seule photo passe par l'éditeur ; plusieurs photos, vidéos et fichiers partent directement.
  const surFichiers = (liste) => {
    if (liste.length === 1 && genreFichier(liste[0]) === "image" && liste[0].size <= SEUIL_UPLOAD_DIRECT) {
      setPhotoAEditer(liste[0]);
      return;
    }
    liste.forEach((f) => {
      if (genreFichier(f) === "image" && f.size <= SEUIL_UPLOAD_DIRECT) sendImage(f);
      else envoyerPiece(f);
    });
  };

  const enr = useEnregistreur({
    onTermine: (fichier, duree) => envoyerPiece(fichier, { vocal: true, duree }),
    onErreur: (message) => toast({ title: "Message vocal", description: message, variant: "destructive" }),
  });

  // Recherche (bouton i) : la conversation défile jusqu'au message, qui est mis en évidence 2 secondes.
  const allerAuMessage = (id) => {
    setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setSurligne(id);
      setTimeout(() => setSurligne(null), 2000);
    }, 150);
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
  // 1.3.35 : le doigt bouge (barre d'un audio ou d'une vidéo, défilement) : pas de menu.
  const onPointerMoveMenu = (e) => {
    if (Math.abs(e.clientX - pressPoint.current.x) > 10 || Math.abs(e.clientY - pressPoint.current.y) > 10) cancelPress();
  };
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
  const repliedOf = (id) => messages.find((x) => x.id === id);
  // 1.3.35 : « vu » façon Messenger : la photo de chaque lecteur sous le dernier message qu'il a lu.
  const visibles = messages.filter(isRenderableMessage);
  const vus = positionsVu(visibles, otherParticipants);
  const profilDe = (uid) => profiles.find((p) => p.created_by_id === uid) || { created_by_id: uid, display_name: nameOf(uid) };
  const dernier = visibles[visibles.length - 1];
  const typer = conversation.typing_user_id ? profilDe(conversation.typing_user_id) : null;

  // Plein écran façon Messenger : la conversation occupe tout l'écran (nom en
  // haut, derniers messages et barre d'envoi toujours visibles), rendue par
  // portal vers document.body pour échapper aux transformations d'animation
  // de la page (framer-motion) et au décalage du chrome de l'application.
  return createPortal(
<div className="fixed inset-0 z-[55] flex flex-col w-full bg-background overflow-hidden">
      <style>{CSS_MESSAGES}</style>
      {/* 1.3.35 : fond « Aurore » derrière la conversation */}
      <FondSection cle="messages" sombre={sombre} absolu />
      {/* Header */}
      <div
        className="relative z-[2] flex items-center gap-2.5 bg-background/85 backdrop-blur-xl border-b border-border px-3 py-2.5"
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
            <StatutEnTete ecrit={typing} statut={statusText} />
          </div>
        </div>
        {/* i : infos de la conversation (profil, recherche, photos, liens), façon Messenger */}
        <button
          onClick={() => setInfosOuvertes(true)}
          className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted shrink-0 text-primary"
          aria-label="Infos de la conversation"
        >
          <Info className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative z-[1] flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-1 selectable mx-auto w-full max-w-3xl"
      >
        {messages.length === 0 ? (
          <div className="py-16 text-center text-foreground/40 text-sm">
            Aucun message pour le moment. Écrivez le premier !
          </div>
        ) : visibles.map((m, i, visibleMessages) => {
          const mine = m.sender_id === user.id;
          const pj = aPieceJointe(m) ? m.piece_jointe : null;
          // Photo seule, vidéo ou photo jointe : sans bulle autour.
          const imageOnly = (!!m.image_url || (pj && (pj.genre === "video" || pj.genre === "image"))) && !m.text;
          const nouveau = new Date(m.created_date).getTime() > ouvertLe.current - 1500;
          // « Like » (1.3.27) : un message fait d'un seul pouce 👍 s'affiche en grand, sans bulle (comme Messenger).
          const like = !m.image_url && !pj && String(m.text || "").trim() === LIKE;
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
              id={`msg-${m.id}`}
              className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${nouveau ? (mine ? "chay-msg-moi" : "chay-msg-autre") : ""} ${
                grouped ? "mt-0.5" : "mt-2.5"
              } ${surligne === m.id ? "rounded-[12px] bg-primary/15 transition-colors" : ""}`}
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
                    <div className="font-bold">{nomCourt(replied.sender_id, replied.sender_name)}</div>
                    {(replied.text || replied.image_url || aPieceJointe(replied)) && (
                      <div className="truncate">
                        {replied.text || (replied.image_url ? "📷 Photo" : apercuPiece(replied.piece_jointe))}
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
                  onPointerMove={onPointerMoveMenu}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onContextMenu={(e) => onContextMenuMenu(e, m)}
                  className={`w-fit max-w-full rounded-[12px] cursor-pointer select-none transition active:scale-[0.99] ${editing?.id === m.id ? "hidden" : ""} ${
                    imageOnly || like
                      ? "p-0 bg-transparent border-0 shadow-none"
                      : `px-3.5 py-2 ${mine ? "brand-gradient text-white rounded-br-[4px]" : "bg-card border border-border rounded-bl-[4px]"}`
                  }`}
                >
                  {isGroup && !mine && !grouped && (
                    <div className="text-[0.6875rem] font-semibold leading-tight text-primary mb-0.5">
                      {/* 1.3.35 : en groupe, le prénom seul, en plus petit */}
                      <MemberName userId={m.sender_id} fallback={m.sender_name} prenom />
                    </div>
                  )}
                  {m.image_url && (
                    <button
                      type="button"
                      onClick={() => openPhoto(m)}
                      className={`block overflow-hidden focus:outline-none ${imageOnly ? "rounded-[10px]" : "rounded-[8px] mb-1"} max-w-[240px] md:max-w-[280px]`}
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
                  {pj && (
                    <div className={m.text ? "mb-1" : ""}>
                      <PieceJointeBulle pj={pj} mine={mine} graine={m.id} onVoirPhoto={(url) => setViewer({ images: [url], index: 0 })} />
                    </div>
                  )}
                  {like ? (
                    <div className={`text-5xl leading-none ${nouveau ? "chay-msg-pouce" : ""}`} role="img" aria-label="J'aime">{LIKE}</div>
                  ) : m.text ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      <TexteAvecLiens texte={m.text} clair={mine} />
                    </div>
                  ) : null}
                </div>
                <VuPar
                  lecteurs={(vus[m.id] || []).map(profilDe)}
                  envoye={mine && m === dernier && !(vus[m.id] || []).length}
                  groupe={isGroup}
                />
              </div>
            </div>
          );
        })}
        {/* 1.3.35 : envois en cours (barre de progression dans la bulle) */}
        <AnimatePresence initial={false}>
          {envois.map((x) => (
            <motion.div
              key={x.cle}
              className="mt-2 flex justify-end"
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              style={{ transformOrigin: "100% 100%" }}
            >
              <div className="w-[15.5rem] max-w-[82%] rounded-[12px] rounded-br-[4px] brand-gradient px-3.5 py-2.5 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="min-w-0 flex-1 truncate">{x.genre === "vocal" ? "🎤 Message vocal" : apercuPiece({ genre: x.genre, nom: x.nom })}</span>
                  {x.erreur ? (
                    <button type="button" onClick={() => reessayer(x)} className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs" aria-label="Réessayer l'envoi">
                      <RotateCw className="h-3.5 w-3.5" /> Réessayer
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-white/85">{Math.round(x.progres)} %</span>
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-[width] duration-300 ease-out" style={{ width: `${x.erreur ? 100 : Math.max(4, x.progres)}%`, opacity: x.erreur ? 0.35 : 1 }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[0.6875rem] text-white/80">
                  <span className="truncate">{x.erreur || "Envoi…"}</span>
                  <button type="button" onClick={() => annulerEnvoi(x.cle)} className="shrink-0 font-semibold underline-offset-2 hover:underline">Annuler</button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <BulleEcrit visible={typing === true} profil={typer} nom={typer ? nomCourt(typer.created_by_id, typer.display_name) : ""} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="relative z-[2] border-t border-border bg-muted/80 backdrop-blur-md px-3 py-2 flex items-center gap-2">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-primary">
              {nomCourt(replyTo.sender_id, replyTo.sender_name)}
            </div>
            {(replyTo.text || replyTo.image_url || aPieceJointe(replyTo)) && (
              <div className="text-xs text-foreground/60 truncate">
                {replyTo.text || (replyTo.image_url ? "📷 Photo" : apercuPiece(replyTo.piece_jointe))}
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
      {automatique ? (
        <div
          className="relative z-10 border-t border-border bg-background/95 px-4 py-3 text-center text-xs text-foreground/60"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          Message automatique de Chay : on ne peut pas y répondre.
        </div>
      ) : (
      <>
      {/* Composer */}
      <div
        className="relative z-10 bg-background/95 backdrop-blur-md border-t border-border px-3 py-2 safe-area-pb"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence>
          {showEmoji && (
            <motion.div
              className="absolute bottom-full left-2 right-2 mb-2"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              style={{ transformOrigin: "90% 100%" }}
            >
              <EmojiPicker onPick={(em) => setDraft((d) => d + em)} />
            </motion.div>
          )}
        </AnimatePresence>
        <MenuPlus ouvert={menuPlus} onFermer={() => setMenuPlus(false)} onFichiers={surFichiers} />

        {/* 1.3.35 : + (fichiers) · appareil photo · galerie · micro (vocal) | champ | emoji · 👍 / Envoyer.
            Dès qu'on écrit, l'appareil photo, la galerie et le micro se replient pour laisser la place au texte. */}
        <div className="flex items-end gap-1.5 w-full max-w-3xl mx-auto">
          {!enr.actif && (
            <motion.button
              type="button"
              onClick={() => { setShowEmoji(false); setMenuPlus((o) => !o); }}
              animate={{ scale: menuPlus ? 1.08 : 1 }}
              whileTap={{ scale: 0.88 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className={`h-10 w-10 shrink-0 grid place-items-center rounded-full transition ${menuPlus ? "bg-primary text-primary-foreground" : "text-primary hover:bg-muted"}`}
              aria-label="Joindre un fichier"
              data-bouton-plus
              aria-expanded={menuPlus}
            >
              <Plus className="h-6 w-6" />
            </motion.button>
          )}

          <AnimatePresence initial={false}>
            {!draft.trim() && !enr.actif && (
              <motion.div
                key="outils"
                className="flex shrink-0 items-end gap-1.5 overflow-hidden"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              >
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="h-10 w-10 shrink-0 grid place-items-center rounded-full hover:bg-muted text-foreground/60"
                  aria-label="Prendre une photo"
                >
                  <Camera className="h-5 w-5" />
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-10 w-10 shrink-0 grid place-items-center rounded-full hover:bg-muted text-foreground/60"
                  aria-label="Image"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoAEditer(f); e.target.value = ""; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotoAEditer(f); e.target.value = ""; }} />

          {/* Micro : reste à sa place pendant l'enregistrement (le doigt reste dessus) */}
          {!draft.trim() && enr.etat !== "mainsLibres" && <BoutonMicro enr={enr} onGlisse={setGlisse} />}

          {enr.actif ? (
            <BarreEnregistrement enr={enr} glisse={glisse} />
          ) : (
            /* Entrée = à la ligne (téléphone et ordinateur) ; l'envoi se fait seulement avec le bouton Envoyer.
               Le champ grandit avec le texte (jusqu'à 6 lignes environ, puis défilement). */
            <textarea
              ref={champRef}
              value={draft}
              onChange={(e) => {
                onDraftChange(e);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
              }}
              onFocus={() => setMenuPlus(false)}
              rows={1}
              enterKeyHint="enter"
              placeholder="Message…"
              className="flex-1 min-w-0 max-h-36 resize-none rounded-3xl border border-border bg-card px-4 py-2.5 text-sm leading-5 outline-none focus:border-primary shadow-inner transition-[border-color]"
            />
          )}

          {enr.etat === "mainsLibres" ? (
            <EnvoyerVocal enr={enr} />
          ) : !enr.actif && (
            <>
              {/* Emoji, à côté de J'aime / Envoyer (1.3.35) */}
              <button
                onClick={() => { setMenuPlus(false); setShowEmoji((s) => !s); }}
                className={`h-10 w-10 shrink-0 grid place-items-center rounded-full hover:bg-muted transition ${
                  showEmoji ? "text-primary bg-muted" : "text-foreground/60"
                }`}
                aria-label="Emojis"
                aria-expanded={showEmoji}
              >
                <Smile className="h-5 w-5" />
              </button>
              {/* Champ vide : 👍 (envoyé aussitôt, en grand) ; dès qu'on écrit : Envoyer, qui tourne en apparaissant. */}
              <AnimatePresence mode="popLayout" initial={false}>
                {draft.trim() || sending ? (
                  <motion.button
                    key="envoyer"
                    onClick={() => send()}
                    disabled={sending}
                    initial={{ scale: 0.3, rotate: -90, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.3, rotate: 90, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 26 }}
                    whileTap={{ scale: 0.88 }}
                    className="h-10 w-10 shrink-0 grid place-items-center rounded-full brand-gradient text-white disabled:opacity-50 shadow-lg"
                    aria-label="Envoyer"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                  </motion.button>
                ) : (
                  <motion.button
                    key="pouce"
                    onClick={() => send(LIKE)}
                    initial={{ scale: 0.3, rotate: 60, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.3, rotate: -60, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 24 }}
                    whileTap={{ scale: 1.35, rotate: -12 }}
                    className="h-10 w-10 shrink-0 grid place-items-center rounded-full text-[1.65rem] leading-none"
                    aria-label="Envoyer un pouce"
                  >
                    <span aria-hidden="true">{LIKE}</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
      </>
      )}

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


      {viewer && (
        <PhotoViewer
          images={viewer.images}
          index={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}

      {infosOuvertes && (
        <InfosConversation
          titre={title}
          avatar={avatarUrl}
          autreId={otherId}
          messages={messages}
          nomDe={(m) => (m.sender_id === user?.id ? "Vous" : nomCourt(m.sender_id, m.sender_name))}
          onFermer={() => setInfosOuvertes(false)}
          onAllerAuMessage={allerAuMessage}
          onVoirPhoto={openPhoto}
          groupe={isGroup ? {
            conversation,
            user,
            profiles,
            // Gestion du groupe : son admin, ou un admin de l'app (même règle que le serveur).
            peutGerer: conversation?.admin_id === user?.id || user?.role === "admin",
            onUpdated: onRefresh,
          } : null}
        />
      )}

      {photoAEditer && (
        <PhotoEditeur
          fichier={photoAEditer}
          onAnnuler={() => setPhotoAEditer(null)}
          onEnvoyer={(photo) => { setPhotoAEditer(null); sendImage(photo); }}
        />
      )}
    </div>,
    document.body
  );
}