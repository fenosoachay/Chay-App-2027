import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ExternalLink from "@/components/ExternalLink";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  CheckCircle,
  Loader2,
  ArrowDown,
} from "lucide-react";

export default function AboutDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [saving, setSaving] = useState(false);

  // APK state
  const [appVersion, setAppVersion] = useState("");
  const [latestVersion, setLatestVersion] = useState("");
  const [latestApkUrl, setLatestApkUrl] = useState("");
  const [apkUrl, setApkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadNotices = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.AppNotice.list("-created_date", 20);
      setNotices(Array.isArray(list) ? list : []);
    } catch {
      setNotices([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAppVersion = async () => {
    try {
      const list = await base44.entities.AppContent.list("-created_date", 1);
      const rec = Array.isArray(list) && list[0] ? list[0] : null;
      if (rec?.app_version) setLatestVersion(rec.app_version);
      if (rec?.app_apk_url) setLatestApkUrl(rec.app_apk_url);
    } catch {}
  };

  useEffect(() => {
    if (open) {
      loadNotices();
      loadAppVersion();
    }
  }, [open]);

  const addNotice = async () => {
    if (!newTitle.trim() || !newText.trim()) {
      toast({ title: "Titre et texte sont requis", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.AppNotice.create({ title: newTitle, text: newText });
      setNewTitle("");
      setNewText("");
      loadNotices();
      toast({ title: "Annonce ajoutée" });
    } catch (e) {
      toast({ title: "Échec", description: e?.message });
    }
  };

  const deleteNotice = async (id) => {
    try {
      await base44.entities.AppNotice.delete(id);
      loadNotices();
      toast({ title: "Annonce supprimée" });
    } catch (e) {
      toast({ title: "Échec", description: e?.message });
    }
  };

  const startEdit = (notice) => {
    setEditingId(notice.id);
    setEditTitle(notice.title);
    setEditText(notice.text);
  };

  const saveEdit = async () => {
    if (!editTitle.trim() || !editText.trim()) {
      toast({ title: "Titre et texte sont requis", variant: "destructive" });
      return;
    }
    try {
      await base44.entities.AppNotice.update(editingId, { title: editTitle, text: editText });
      setEditingId(null);
      loadNotices();
      toast({ title: "Annonce mise à jour" });
    } catch (e) {
      toast({ title: "Échec", description: e?.message });
    }
  };

  const uploadApk = async () => {
    if (!apkUrl.trim()) {
      toast({ title: "URL requise", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      await base44.entities.AppContent.create({
        about_text: "",
        splash_text_mg: "",
        splash_text_fr: "",
        app_version: appVersion,
        app_apk_url: apkUrl.trim(),
      });
      setApkUrl("");
      setAppVersion("");
      loadAppVersion();
      toast({ title: "Version enregistrée" });
    } catch (e) {
      toast({ title: "Échec", description: e?.message });
    }
    setUploading(false);
  };

  const hasLatestVersion = latestVersion && appVersion && appVersion === latestVersion;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[1.5rem] max-h-[85vh] overflow-y-auto">
        <div className="space-y-4">
          <h2 className="font-display font-extrabold text-2xl">À Propos</h2>

          {/* Liste des annonces */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : notices.length === 0 ? (
            <p className="text-sm text-foreground/50">Aucune annonce pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <div key={n.id} className="rounded-xl border border-border bg-card p-4">
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Titre…"
                        className="h-9"
                      />
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Texte…"
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3 mr-1" /> Annuler
                        </Button>
                        <Button variant="default" size="sm" onClick={saveEdit}>
                          <Save className="h-3 w-3 mr-1" /> Sauvegarder
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-bold text-sm text-foreground">{n.title}</p>
                        <p className="text-sm text-foreground/70 mt-1 whitespace-pre-line">{n.text}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(n)}
                            className="h-8 w-8 grid place-items-center rounded-lg border border-border hover:bg-muted transition"
                            aria-label="Modifier"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => deleteNotice(n.id)}
                            className="h-8 w-8 grid place-items-center rounded-lg border border-border hover:bg-destructive/10 hover:text-destructive transition"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Zone d'ajout (admin) */}
          {isAdmin && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground/50">
                Ajouter une annonce
              </p>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titre…"
                className="h-9"
              />
              <Textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Texte…"
                rows={3}
                className="text-sm"
              />
              <Button onClick={addNotice} disabled={saving} className="w-full">
                <Plus className="h-4 w-4 mr-2" /> Ajouter
              </Button>
            </div>
          )}

          {/* Section APK / Version (admin) */}
          {isAdmin && (
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground/50">
                Version de l'application
              </p>
              <div>
                <label className="text-xs text-foreground/50 mb-1 block">Version</label>
                <Input
                  type="text"
                  value={appVersion}
                  onChange={(e) => setAppVersion(e.target.value)}
                  placeholder="Ex: 2.1.0"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-foreground/50 mb-1 block">
                  URL du fichier APK (dernière version)
                </label>
                <input
                  type="url"
                  value={apkUrl}
                  onChange={(e) => setApkUrl(e.target.value)}
                  placeholder="https://exemple.com/app-v2.1.0.apk"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button
                onClick={uploadApk}
                disabled={uploading || !apkUrl.trim()}
                className="w-full"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {uploading ? "Enregistrement…" : "Enregistrer la version"}
              </Button>
            </div>
          )}

          {/* Vérification de version pour TOUS les utilisateurs */}
          {hasLatestVersion && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mt-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Vous avez la dernière version de l'application
            </div>
          )}
          {latestVersion && !hasLatestVersion && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/60 mt-2">
              <ArrowDown className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Une nouvelle version disponible.</span>
              <br />
              <span>
                Téléchargez{" "}
                <ExternalLink
                  href={latestApkUrl}
                  className="text-primary underline hover:no-underline font-medium"
                >
                  ici
                </ExternalLink>
                .
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}