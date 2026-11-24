import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Search, Check, Camera, Loader2, Users, MessageSquare } from "lucide-react";
import Avatar from "@/components/messages/Avatar";
import RognerPhotoGroupe from "@/components/messages/RognerPhotoGroupe";
import { isOnline } from "@/hooks/usePresence";

export default function NewChatSheet({
  open,
  onOpenChange,
  user,
  profiles,
  conversations,
  onCreated,
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState("direct");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupPhoto, setGroupPhoto] = useState(null);
  const [photoARogner, setPhotoARogner] = useState(null); // 1.3.28 : recadrage carré avant de garder la photo
  const [creating, setCreating] = useState(false);

  // Sans le compte automatique « Chay » (messages automatiques, on ne lui écrit pas).
  const others = profiles.filter((p) => p.created_by_id !== user?.id && !p.systeme);
  const filtered = query
    ? others.filter((p) =>
        (p.display_name || "").toLowerCase().includes(query.toLowerCase())
      )
    : others;

  const reset = () => {
    setMode("direct");
    setQuery("");
    setSelected([]);
    setGroupName("");
    setGroupPhoto(null);
  };

  const startDirect = async (uid) => {
    const existing = conversations.find(
      (c) =>
        c.type === "direct" &&
        c.participant_ids?.includes(uid) &&
        c.participant_ids?.includes(user.id)
    );
    if (existing) {
      onCreated(existing.id);
      onOpenChange(false);
      reset();
      return;
    }
    try {
      const c = await base44.entities.Conversation.create({
        type: "direct",
        participant_ids: [user.id, uid],
      });
      onCreated(c.id);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const toggleSelect = (uid) =>
    setSelected((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      let photo_url = null;
      if (groupPhoto) {
        photo_url = await uploadToBase44(groupPhoto);
      }
      const c = await base44.entities.Conversation.create({
        type: "group",
        participant_ids: [user.id, ...selected],
        name: groupName.trim(),
        photo_url,
        admin_id: user.id,
      });
      onCreated(c.id);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setCreating(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Nouvelle conversation</DrawerTitle>
          <DrawerDescription>
            Choisissez un membre pour un échange privé ou créez un groupe.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => setMode("direct")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition ${
              mode === "direct"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card"
            }`}
          >
            <MessageSquare className="h-4 w-4" /> Message
          </button>
          {user?.role === "admin" && (
            <button
              onClick={() => setMode("group")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition ${
                mode === "group"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card"
              }`}
            >
              <Users className="h-4 w-4" /> Groupe
            </button>
          )}
        </div>

        {mode === "group" && (
          <div className="px-4 pb-3 space-y-3">
            <RognerPhotoGroupe
              enLigne
              file={photoARogner}
              onCancel={() => setPhotoARogner(null)}
              onConfirm={(blob) => { setGroupPhoto(new File([blob], "groupe.jpg", { type: "image/jpeg" })); setPhotoARogner(null); }}
            />
            <div className="flex items-center gap-3">
              <label className="h-12 w-12 rounded-full border border-border grid place-items-center cursor-pointer overflow-hidden relative shrink-0">
                {groupPhoto ? (
                  <img
                    src={URL.createObjectURL(groupPhoto)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Camera className="h-5 w-5 text-foreground/50" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPhotoARogner(f); }}
                />
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nom du groupe"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
            {selected.length > 0 && (
              <p className="text-xs font-semibold text-foreground/50">
                {selected.length} membre(s) sélectionné(s)
              </p>
            )}
          </div>
        )}

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-foreground/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un membre…"
              className="bg-transparent outline-none text-sm font-medium flex-1"
            />
          </div>
        </div>

        <div className="overflow-y-auto px-4 pb-3 max-h-[40vh] space-y-1">
          {filtered.map((p) => {
            const isSel = selected.includes(p.created_by_id);
            return (
              <button
                key={p.id}
                onClick={() =>
                  mode === "direct"
                    ? startDirect(p.created_by_id)
                    : toggleSelect(p.created_by_id)
                }
                className="flex items-center gap-3 w-full text-left px-2 py-2 rounded-2xl hover:bg-muted transition"
              >
                <Avatar
                  name={p.display_name}
                  src={p.avatar_url}
                  size={40}
                  online={isOnline(p.last_seen_at)}
                />
                <span className="flex-1 font-semibold truncate">
                  {p.display_name}
                </span>
                {mode === "group" && isSel && (
                  <span className="h-6 w-6 grid place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center py-6 text-sm text-foreground/50">
              Aucun membre trouvé.
            </p>
          )}
        </div>

        {mode === "group" && (
          <div className="px-4 pb-6">
            <button
              onClick={createGroup}
              disabled={!groupName.trim() || selected.length === 0 || creating}
              className="w-full rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              Créer le groupe
            </button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}