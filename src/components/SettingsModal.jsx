import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import {
  User,
  Trash2,
  Loader2,
  AlertTriangle,
  Mail,
  Save,
  CalendarDays,
  Phone,
  MapPin,
  Camera,
  LogOut,
  KeyRound,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Image } from "@/components/ui/image";
import DailyVerseCard from "@/components/notifications/DailyVerseCard";

export default function SettingsModal({ open, onOpenChange }) {
  const { user, deleteAccount, logout } = useAuth();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        birth_date: user.birth_date || "",
        phone: user.phone || "",
        location_label: user.location_label || "",
        profile_photo_url: user.profile_photo_url || "",
      });
    }
  }, [user]);

  const handleDelete = async () => {
    setError("");
    setLoading(true);
    try {
      await deleteAccount();
    } catch (err) {
      setError(err.message || "Échec de la suppression du compte");
      setLoading(false);
      setConfirming(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(profile);
      toast({ title: "Profil mis à jour" });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const photo_url = await uploadToBase44(file);
      setProfile((p) => ({ ...p, profile_photo_url: photo_url }));
      await base44.auth.updateMe({ profile_photo_url: photo_url });
      toast({ title: "Photo mise à jour" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setUploadingPhoto(false);
  };

  const handleLogout = () => logout();

  const sendResetEmail = async () => {
    if (!user?.email) return;
    setResetting(true);
    try {
      await base44.auth.resetPasswordRequest(user.email);
      toast({
        title: "E-mail envoyé",
        description: "Vérifiez votre boîte de réception pour réinitialiser votre mot de passe.",
      });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setResetting(false);
  };

  const handleOpenChange = (v) => {
    if (!v) {
      setConfirming(false);
      setError("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-[1.5rem] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display font-extrabold">
            <User className="h-5 w-5 text-primary" /> Paramètres
          </DialogTitle>
          <DialogDescription>
            Gérez votre profil et vos préférences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Account */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-foreground/50">
              Compte
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Mail className="h-4 w-4 text-foreground/50" />
              <span className="font-bold text-sm">{user?.email || "—"}</span>
            </div>
            <div className="text-xs text-foreground/50 mt-1 capitalize">
              {user?.role || "user"}
            </div>
          </div>

          {/* Security */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-foreground/50">
              Sécurité
            </div>
            <Button variant="outline" className="w-full" onClick={sendResetEmail} disabled={resetting}>
              {resetting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4 mr-2" />
              )}
              Mot de passe oublié
            </Button>
          </div>

          {/* Profile */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-foreground/50">
              Mon profil
            </div>
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer shrink-0">
                <div className="h-16 w-16 rounded-full overflow-hidden brand-gradient grid place-items-center text-white font-bold text-xl">
                  {profile.profile_photo_url ? (
                    <Image
                      src={profile.profile_photo_url}
                      fittingType="fill"
                      className="w-full h-full"
                    />
                  ) : (
                    (user?.first_name || user?.full_name?.[0] || user?.email || "?")[0]?.toUpperCase()
                  )}
                </div>
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-background">
                  {uploadingPhoto ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Camera className="h-3 w-3" />
                  )}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
              </label>
              <div>
                <div className="font-bold text-sm">
                  {user?.full_name ||
                    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
                    user?.email}
                </div>
                <div className="text-xs text-foreground/50">
                  Changer la photo de profil
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prénom</Label>
                <Input
                  value={profile.first_name || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, first_name: e.target.value })
                  }
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Nom</Label>
                <Input
                  value={profile.last_name || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, last_name: e.target.value })
                  }
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Date de naissance
              </Label>
              <Input
                type="date"
                value={profile.birth_date || ""}
                onChange={(e) =>
                  setProfile({ ...profile, birth_date: e.target.value })
                }
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Phone className="h-3 w-3" /> Téléphone
              </Label>
              <Input
                value={profile.phone || ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                className="mt-1 h-9"
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Localisation
              </Label>
              <Input
                value={profile.location_label || ""}
                onChange={(e) =>
                  setProfile({ ...profile, location_label: e.target.value })
                }
                className="mt-1 h-9"
                placeholder="Ville, Pays"
              />
            </div>
            <Button
              onClick={saveProfile}
              disabled={saving}
              className="w-full"
              size="sm"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Enregistrer le profil
            </Button>
            <DailyVerseCard user={user} />
          </div>

          {/* Preferences */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Mode sombre</span>
              <ThemeToggle />
            </div>
          </div>

          {/* Logout */}
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
          </Button>

          {/* Delete Account */}
          {!confirming ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Supprimer mon compte
            </Button>
          ) : (
            <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-destructive text-sm">
                    Confirmer la suppression
                  </div>
                  <p className="text-xs text-foreground/60 mt-1">
                    Cette action est irréversible. Toutes vos données seront
                    définitivement supprimées.
                  </p>
                </div>
              </div>
              {error && (
                <div className="text-sm text-destructive font-medium">{error}</div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setConfirming(false);
                    setError("");
                  }}
                  disabled={loading}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Suppression…
                    </>
                  ) : (
                    "Confirmer"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}