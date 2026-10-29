import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { confirmFr } from "@/lib/confirmFr";
import {
  Bell,
  CheckCheck,
  Eraser,
  Loader2,
  Music,
  Film,
  BookOpen,
  GraduationCap,
  Megaphone,
  CalendarDays,
  Newspaper,
  FileText,
  Heart,
  MessageCircle,
  Sparkles,
  Trash2,
} from "lucide-react";

const ICONS = {
  audio: Music,
  video: Film,
  predication: BookOpen,
  enseignement: GraduationCap,
  annonce: Megaphone,
  evenement: CalendarDays,
  actualite: Newspaper,
  autre: FileText,
  like: Heart,
  comment: MessageCircle,
  message: MessageCircle,
};

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const unread = useUnreadNotifications(user);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await base44.entities.UserNotification.filter(
        { user_id: user.id },
        "-created_date",
        100
      );
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const unsub = base44.entities.UserNotification.subscribe(load);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [load]);

  const openOne = async (n) => {
    if (!n.is_read) {
      try {
        await base44.entities.UserNotification.update(n.id, {
          is_read: true,
          read_at: new Date().toISOString(),
        });
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
      } catch {
        /* ignore */
      }
    }
    if (n.type === "daily_verse" || n.content_type === "devotional") {
      navigate("/");
    } else if (n.type === "new_content") {
      navigate("/media");
    } else if (n.type === "message" || n.content_type === "message") {
      navigate(n.content_id ? `/messages?c=${n.content_id}` : "/messages");
    } else if (n.type === "like" || n.type === "comment") {
      navigate("/community");
    }
  };

  const markAll = async () => {
    const unreadRows = items.filter((i) => !i.is_read);
    if (!unreadRows.length) return;
    try {
      await base44.entities.UserNotification.bulkUpdate(
        unreadRows.map((i) => ({
          id: i.id,
          is_read: true,
          read_at: new Date().toISOString(),
        }))
      );
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      toast({ title: "Tout marqué comme lu" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const deleteOne = async (n) => {
    try {
      await base44.entities.UserNotification.delete(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const clearAll = async () => {
    if (!items.length || clearing) return;
    const ok = await confirmFr({
      title: "Tout supprimer",
      message: `Supprimer les ${items.length} notification${items.length > 1 ? "s" : ""} ?`,
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
    });
    if (!ok) return;
    setClearing(true);
    const snapshot = items;
    setItems([]);
    try {
      await Promise.all(
        snapshot.map((n) =>
          base44.entities.UserNotification.delete(n.id).catch(() => {})
        )
      );
      toast({ title: "Notifications supprimées" });
    } catch (e) {
      setItems(snapshot);
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-6 md:py-10">
      <header className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="font-display font-extrabold text-3xl">
          <span className="brand-gradient-text">Notifications</span>
        </h1>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck className="h-4 w-4 mr-2" /> Tout marquer comme lu
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-foreground/50 hover:text-destructive"
              onClick={clearAll}
              disabled={clearing}
              title="Supprimer toutes les notifications"
              aria-label="Supprimer toutes les notifications"
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eraser className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <Bell className="h-10 w-10 text-foreground/20 mx-auto mb-3" />
          <p className="text-foreground/50">Aucune notification.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = ICONS[n.content_type] || Sparkles;
            return (
              <div
                key={n.id}
                onClick={() => openOne(n)}
                className={`w-full text-left rounded-2xl border p-3 flex items-start gap-3 transition min-h-[64px] cursor-pointer ${
                  n.is_read
                    ? "border-border bg-card"
                    : "border-primary/30 bg-primary/5"
                }`}
              >
                <span
                  className={`h-11 w-11 rounded-xl grid place-items-center shrink-0 ${
                    n.is_read
                      ? "bg-foreground/10 text-foreground"
                      : "brand-gradient text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-sm">{n.title}</span>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </span>
                  {n.message && (
                    <span className="block text-xs text-foreground/60 mt-0.5 line-clamp-2">
                      {n.message}
                    </span>
                  )}
                  <span className="block text-xs text-foreground/40 mt-1">
                    {new Date(n.created_date).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteOne(n); }}
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted text-foreground/50 hover:text-destructive shrink-0"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}