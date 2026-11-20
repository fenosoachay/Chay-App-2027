import React, { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/AuthContext";
import { APK_URL, compareInstalled, describeLatest, fetchLatest } from "@/lib/apkRelease";
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
  Download,
  Share2,
} from "lucide-react";

// Partage de l'application : le fichier d'installation Android (APK), pas le site.
const APP_SHARE_URL = "https://membres.chay.fr/telechargements/chay.apk";
const APP_SHARE_TEXTE = "Installe l'application de l'Église Chay (Android) :";

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

  // Application Android : dernière version publiée (latest.json) et version installée (APK seulement).
  // Le bouton de téléchargement est toujours affiché, même si latest.json est illisible.
  const [latest, setLatest] = useState(null);
  const [installed, setInstalled] = useState(null);

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
    setLatest(await fetchLatest()); // null en cas d'échec : jamais d'erreur
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await CapacitorApp.getInfo();
        setInstalled({ version: info?.version || "", build: info?.build || "" });
      } catch {
        setInstalled(null);
      }
    }
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

  const versionInfo = describeLatest(latest);
  const comparaison = compareInstalled(latest, installed);

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

          {/* Application Android, pour TOUS : adresse stable ; latest.json ne sert qu'à l'information */}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground/50">
              Application Android
            </p>
            {comparaison.etat === "a-jour" && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {comparaison.message}
              </div>
            )}
            {comparaison.etat === "nouvelle" && (
              <div className="flex items-center gap-2 text-sm text-foreground/70">
                <ArrowDown className="h-4 w-4 shrink-0" />
                {comparaison.message}
              </div>
            )}
            <p className="text-xs text-foreground/50">
              {versionInfo || "Information de version indisponible pour le moment."}
            </p>
            <ExternalLink
              href={APK_URL}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition"
            >
              <Download className="h-4 w-4" />
              Télécharger l'application Android
            </ExternalLink>
            <p className="text-xs text-foreground/50">
              Si Android refuse l'installation, désinstallez d'abord l'ancienne application, puis réinstallez.
            </p>

            {/* Partager l'application */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground/50 mb-2">
                Partager l'application
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const url = APP_SHARE_URL;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: "Application Église Chay", text: APP_SHARE_TEXTE, url });
                      return;
                    } catch {
                      // L'utilisateur a annulé ou erreur -> fallback
                    }
                  }
                  // Fallback : copie dans le presse-papiers
                  try {
                    await navigator.clipboard.writeText(`${APP_SHARE_TEXTE} ${url}`);
                    toast({ title: "Lien copié dans le presse-papiers" });
                  } catch {
                    toast({ title: "Impossible de copier", variant: "destructive" });
                  }
                }}
              >
                <Share2 className="h-4 w-4 mr-2" /> Partager l'application (Android)
              </Button>
              <p className="text-xs text-foreground/50 mt-1 text-center">{APP_SHARE_URL}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}