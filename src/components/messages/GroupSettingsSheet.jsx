import React, { useEffect, useState } from "react";
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
import { Camera, Check, Loader2, UserMinus, Users } from "lucide-react";
import Avatar from "@/components/messages/Avatar";
import { isOnline } from "@/hooks/usePresence";

export default function GroupSettingsSheet({
  open,
  onOpenChange,
  conversation,
  user,
  profiles,
  onUpdated,
}) {
  const { toast } = useToast();
  const [name, setName] = useState(conversation?.name || "");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(conversation?.name || "");
      setPhoto(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  }, [open, conversation?.id]);

  const isAdmin = conversation?.admin_id === user?.id;
  const members = (conversation?.participant_ids || [])
    .map((id) => profiles.find((p) => p.created_by_id === id))
    .filter(Boolean);
  const candidates = profiles.filter(
    (p) =>
      p.created_by_id !== user?.id &&
      !(conversation?.participant_ids || []).includes(p.created_by_id)
  );

  const saveInfo = async () => {
    setSaving(true);
    try {
      let photo_url = conversation?.photo_url;
      if (photo) {
        photo_url = await uploadToBase44(photo);
      }
      await base44.entities.Conversation.update(conversation.id, {
        name: name.trim(),
        photo_url,
      });
      toast({ title: "Groupe mis à jour" });
      onUpdated?.();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const addMember = async (uid) => {
    try {
      const next = [...(conversation.participant_ids || []), uid];
      await base44.entities.Conversation.update(conversation.id, { participant_ids: next });
      toast({ title: "Membre ajouté" });
      onUpdated?.();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const removeMember = async (uid) => {
    try {
      const next = (conversation.participant_ids || []).filter((id) => id !== uid);
      await base44.entities.Conversation.update(conversation.id, { participant_ids: next });
      toast({ title: "Membre retiré" });
      onUpdated?.();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Paramètres du groupe</DrawerTitle>
          <DrawerDescription>
            Gérez le nom, la photo et les membres.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3">
            <label className="h-14 w-14 rounded-full border border-border grid place-items-center cursor-pointer overflow-hidden relative shrink-0">
              {photo ? (
                <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
              ) : conversation?.photo_url ? (
                <img src={conversation.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-foreground/50" />
              )}
              {isAdmin && (
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
              )}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              placeholder="Nom du groupe"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </div>

          {isAdmin && (
            <button
              onClick={saveInfo}
              disabled={saving}
              className="w-full rounded-full brand-gradient text-white px-5 py-3 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
          )}

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-foreground/50 mb-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Membres ({(conversation?.participant_ids || []).length})
            </div>
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-muted">
                  <Avatar name={m.display_name} src={m.avatar_url} size={36} online={isOnline(m.last_seen_at)} />
                  <span className="flex-1 font-semibold truncate">
                    {m.display_name}
                    {m.created_by_id === conversation?.admin_id ? " (admin)" : ""}
                  </span>
                  {isAdmin && m.created_by_id !== user?.id && (
                    <button
                      onClick={() => removeMember(m.created_by_id)}
                      className="h-8 w-8 grid place-items-center rounded-full text-destructive hover:bg-destructive/10"
                      aria-label="Retirer"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isAdmin && candidates.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-foreground/50 mb-2">
                Ajouter des membres
              </div>
              <div className="space-y-1">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addMember(p.created_by_id)}
                    className="flex items-center gap-3 w-full text-left px-2 py-2 rounded-2xl hover:bg-muted"
                  >
                    <Avatar name={p.display_name} src={p.avatar_url} size={36} online={isOnline(p.last_seen_at)} />
                    <span className="flex-1 font-semibold truncate">{p.display_name}</span>
                    <span className="text-primary font-bold text-sm">Ajouter</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}