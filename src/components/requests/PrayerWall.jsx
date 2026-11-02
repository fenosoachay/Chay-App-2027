import React, { useEffect, useState, useCallback } from "react";
import { HeartHandshake, Loader2, RefreshCw, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  fetchPrayerWall,
  takePrayer,
  PRAYER_STATUS_STYLE,
  PRAYER_STATUS_LABEL,
  timeAgo,
} from "@/lib/requests";

const CATEGORY_STYLES = {
  "Santé": "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "Famille": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Travail": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Guidance": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "Autre": "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

function PrayerCard({ prayer, onTake, busy }) {
  const isBusy = busy === prayer.id;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 md:p-5 transition hover:border-primary/30">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="grid place-items-center h-6 w-6 rounded-full bg-muted">
            <User className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-foreground/70">Anonyme</span>
          <span>·</span>
          <time>{timeAgo(prayer.created_date)}</time>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            CATEGORY_STYLES[prayer.category] || CATEGORY_STYLES["Autre"]
          }`}
        >
          {prayer.category}
        </span>
      </header>

      <p className="selectable text-sm text-foreground/85 leading-relaxed break-words">
        {prayer.content}
      </p>

      <footer className="mt-4 flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${
          PRAYER_STATUS_STYLE[prayer.status] || PRAYER_STATUS_STYLE.open
        } rounded-full px-2 py-0.5`}>
          {PRAYER_STATUS_LABEL[prayer.status] || "Ouverte"}
        </span>

        <Button
          onClick={() => onTake(prayer.id)}
          disabled={isBusy}
          size="sm"
          className="brand-gradient text-white border-0 text-xs font-bold"
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <HeartHandshake className="h-3.5 w-3.5 mr-1" />
          )}
          Je prends en charge
        </Button>
      </footer>
    </article>
  );
}

export default function PrayerWall() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prayers, setPrayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const items = await fetchPrayerWall();
      setPrayers(items);
    } catch {
      setPrayers([]);
    } finally {
      setLoading(false);
    }
  }, [refreshKey, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTake = async (prayerId) => {
    setBusy(prayerId);
    try {
      await takePrayer(prayerId);
      toast({
        title: "Merci de prier",
        description: "Cette prière est maintenant sous ta responsabilité. Tu la retrouveras dans « Mes prières ».",
      });
      // Retire la prière du mur localement
      setPrayers((prev) => prev.filter((p) => p.id !== prayerId));
    } catch (e) {
      toast({
        title: "Prise en charge impossible",
        description: e.message,
        variant: "destructive",
      });
      // Recharge en cas d'erreur pour avoir l'état à jour
      if (e.message.includes("déjà") || e.message.includes("quelqu'un")) {
        setRefreshKey((k) => k + 1);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold">Mur de prière</h2>
          <p className="text-sm text-muted-foreground">
            {prayers.length > 0
              ? `${prayers.length} prière${prayers.length > 1 ? "s" : ""} attendent quelqu'un`
              : "Aucune prière en attente pour le moment"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : prayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto grid place-items-center h-12 w-12 rounded-2xl bg-muted mb-3">
            <HeartHandshake className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground/80">Le mur est vide</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Sois le premier à déposer une demande, ou reviens plus tard.
            Chaque prière ici est une âme qui attend quelqu'un.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {prayers.map((p) => (
            <PrayerCard
              key={p.id}
              prayer={p}
              onTake={handleTake}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
