import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Loader2, Save, BadgeCheck, Mail } from "lucide-react";
import CroppableUploader from "@/components/media/CroppableUploader";
import ImageCrop from "@/components/media/ImageCrop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function AccountSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        gender: user.gender || "",
        birth_date: user.birth_date || "",
        phone: user.phone || "",
        country: user.country || "",
        city: user.city || "",
        location_label: user.location_label || "",
        profile_photo_url: user.profile_photo_url || "",
        cover_photo_url: user.cover_photo_url || "",
        profile_bio: user.profile_bio || "",
      });
    }
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickAvatar = (file) => {
    if (!file) return;
    setAvatarFile(file);
    setAvatarCropOpen(true);
  };

  // La photo de profil est toujours recadrée en carré avant l'envoi.
  const uploadAvatar = async (blob) => {
    setUploading(true);
    try {
      const photoUrl = await uploadToBase44(blob);
      set("profile_photo_url", photoUrl);
      await base44.auth.updateMe({ profile_photo_url: photoUrl });
      toast({ title: "Photo mise à jour" });
      setAvatarCropOpen(false);
      setAvatarFile(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const uploadCover = async (url) => {
    set("cover_photo_url", url);
    try {
      await base44.auth.updateMe({ cover_photo_url: url });
      toast({ title: "Photo de couverture mise à jour" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const save = async () => {
    if (!form.first_name?.trim()) {
      toast({ title: "Le prénom est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const fullName = `${form.first_name} ${form.last_name}`.trim();
      await base44.auth.updateMe({ ...form, full_name: fullName });
      // Profil public : tous les noms affichés dans l'appli suivent immédiatement.
      const publicInfo = {
        display_name: fullName,
        avatar_url: form.profile_photo_url || "",
        cover_url: form.cover_photo_url || "",
        bio: form.profile_bio || "",
      };
      const mine = await base44.entities.MemberProfile
        .filter({ created_by_id: user.id }, "-created_date", 1)
        .catch(() => []);
      if (mine[0]) await base44.entities.MemberProfile.update(mine[0].id, publicInfo);
      else await base44.entities.MemberProfile.create({ ...publicInfo, last_seen_at: new Date().toISOString() });
      toast({ title: "Profil enregistré" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const initial = (
    user?.first_name ||
    user?.full_name?.[0] ||
    user?.email ||
    "?"
  )[0]?.toUpperCase();

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Photo de couverture</Label>
        <div className="mt-1">
          <CroppableUploader
            value={form.cover_photo_url}
            onChange={uploadCover}
            aspect={2.5}
            crop
            allowOriginal
            label="une photo de couverture"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="relative cursor-pointer shrink-0">
          <div className="h-16 w-16 rounded-full overflow-hidden brand-gradient grid place-items-center text-white font-bold text-xl">
            {form.profile_photo_url ? (
              <Image
                src={form.profile_photo_url}
                fittingType="fill"
                className="w-full h-full"
              />
            ) : (
              initial
            )}
          </div>
          <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-background">
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Camera className="h-3 w-3" />
            )}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickAvatar(e.target.files?.[0])}
          />
        </label>
        <div className="text-sm text-foreground/60">
          Changer la photo de profil
        </div>
      </div>

      <Dialog open={avatarCropOpen} onOpenChange={setAvatarCropOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recadrer la photo de profil</DialogTitle>
            <DialogDescription>
              Ajustez le cadre carré, puis validez.
            </DialogDescription>
          </DialogHeader>
          {avatarFile && (
            <ImageCrop
              file={avatarFile}
              aspect={1}
              onCancel={() => {
                setAvatarCropOpen(false);
                setAvatarFile(null);
              }}
              onConfirm={uploadAvatar}
            />
          )}
          {uploading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Import…
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="rounded-xl bg-muted/40 p-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-foreground/50 shrink-0" />
        <span className="text-sm font-semibold flex-1 break-all">
          {user?.email}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
          <BadgeCheck className="h-3.5 w-3.5" /> Vérifié
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Prénom</Label>
          <Input
            value={form.first_name || ""}
            onChange={(e) => set("first_name", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div>
          <Label className="text-xs">Nom</Label>
          <Input
            value={form.last_name || ""}
            onChange={(e) => set("last_name", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Genre</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {["Homme", "Femme"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => set("gender", g)}
              className={`h-10 rounded-xl border text-sm font-semibold ${
                form.gender === g
                  ? "brand-gradient text-white border-transparent"
                  : "border-border bg-card"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Date de naissance</Label>
          <Input
            type="date"
            value={form.birth_date || ""}
            onChange={(e) => set("birth_date", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div>
          <Label className="text-xs">Téléphone</Label>
          <Input
            value={form.phone || ""}
            onChange={(e) => set("phone", e.target.value)}
            className="mt-1 h-10"
            placeholder="06 12 34 56 78"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Pays</Label>
          <Input
            value={form.country || ""}
            onChange={(e) => set("country", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
        <div>
          <Label className="text-xs">Ville</Label>
          <Input
            value={form.city || ""}
            onChange={(e) => set("city", e.target.value)}
            className="mt-1 h-10"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Localisation</Label>
        <Input
          value={form.location_label || ""}
          onChange={(e) => set("location_label", e.target.value)}
          className="mt-1 h-10"
          placeholder="Ville, Pays"
        />
      </div>

      <div>
        <Label className="text-xs">Biographie (visible sur mon profil)</Label>
        <Textarea
          value={form.profile_bio || ""}
          onChange={(e) => set("profile_bio", e.target.value)}
          className="mt-1"
          rows={3}
          placeholder="Quelques mots à propos de vous, visibles par les autres membres…"
        />
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Enregistrer
      </Button>
    </div>
  );
}