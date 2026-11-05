import React, { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, HeartHandshake, RefreshCw, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchMyPrayerRequests,
  fetchPrayersITakeCharge,
  answerPrayer,
  PRAYER_STATUS_LABEL,
  PRAYER_STATUS_STYLE,
  timeAgo,
} from "@/lib/requests";

const CATEGORY_STYLES = {
  "Santé": "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "Famille": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Travail": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Guidance": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "Autre": "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

function PrayerCardMine({ prayer, showAnswerButton, onAnswer, busy }) {
  const isBusy = busy === prayer.id;
  const canAnswer = showAnswerButton && prayer.status === "taken";

  return (
    <article className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="grid place-items-center h-6 w-6 rounded-full bg-muted">
            <User className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-foreground/70">
            {showAnswerButton ? "Ta demande" : "Tu pries pour"}
          </span>
          <span>·</span>
          <time>{timeAgo(prayer.created_date)}</time>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              CATEGORY_STYLES[prayer.category] || CATEGORY_STYLES["Autre"]
            }`}
          >
            {prayer.category}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              PRAYER_STATUS_STYLE[prayer.status] || PRAYER_STATUS_STYLE.open
            }`}
          >
            {PRAYER_STATUS_LABEL[prayer.status] || prayer.status}
          </span>
        </div>
      </header>

      <p className="selectable text-sm text-foreground/85 leading-relaxed break-words">
        {prayer.content}
      </p>

      {prayer.taken_date && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          🤝 Prise en charge {timeAgo(prayer.taken_date)}
        </p>
      )}
      {prayer.answered_date && (
        <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          ✨ Marquée comme exaucée {timeAgo(prayer.answered_date)}
        </p>
      )}

      {canAnswer && (
        <footer className="mt-4">
          <Button
            onClick={() => onAnswer(prayer.id)}
            disabled={isBusy}
            size="sm"
            className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-xs font-bold"
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Marquer comme exaucée
          </Button>
        </footer>
      )}
    </article>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto grid place-items-center h-12 w-12 rounded-2xl bg-muted mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p>
    </div>
  );
}

export default function MyPrayers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [myRequests, setMyRequests] = useState([]);
  const [iTakeCharge, setITakeCharge] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [mine, taken] = await Promise.all([
        fetchMyPrayerRequests(user.id),
        fetchPrayersITakeCharge(user.id),
      ]);
      setMyRequests(mine);
      setITakeCharge(taken);
    } catch {
      setMyRequests([]);
      setITakeCharge([]);
    } finally {
      setLoading(false);
    }
  }, [refreshKey, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnswer = async (prayerId) => {
    setBusy(prayerId);
    try {
      await answerPrayer(prayerId);
      toast({
        title: "Alléluia ! Prière exaucée",
        description: "La personne qui priait pour toi a été notifiée de cette bonne nouvelle.",
      });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "Action impossible",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  // Filtre : dans les listes actives, on cache les prières déjà exaucées
  const activeRequests = myRequests.filter((p) => p.status !== "answered");
  const activeTaken = iTakeCharge.filter((p) => p.status !== "answered");
  const answeredCount = myRequests.filter((p) => p.status === "answered").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold">Mes prières</h2>
          <p className="text-sm text-muted-foreground">
            Ton espace privé. {answeredCount > 0 && `${answeredCount} prière${answeredCount > 1 ? "s" : ""} exaucée${answeredCount > 1 ? "s" : ""} ✨`}
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

      <Tabs defaultValue="taken" className="w-full">
        <TabsList className="w-full grid grid-cols-2 mb-5">
          <TabsTrigger value="taken" className="text-xs md:text-sm font-semibold">
            <HeartHandshake className="h-3.5 w-3.5 mr-1.5 inline" />
            Je prie pour ({activeTaken.length})
          </TabsTrigger>
          <TabsTrigger value="mine" className="text-xs md:text-sm font-semibold">
            Mes demandes ({activeRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Je prie pour ── */}
        <TabsContent value="taken" className="mt-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : activeTaken.length === 0 ? (
            <EmptyState
              icon={HeartHandshake}
              title="Tu ne pries pour personne actuellement"
              description="Va sur le mur de prière et prends une demande en charge. Chaque prière compte."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeTaken.map((p) => (
                <PrayerCardMine
                  key={p.id}
                  prayer={p}
                  showAnswerButton={false}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Mes demandes ── */}
        <TabsContent value="mine" className="mt-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : activeRequests.length === 0 ? (
            <EmptyState
              icon={User}
              title="Aucune demande active"
              description="Dépose une demande sur le mur de prière. Tu retrouveras ici son évolution."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeRequests.map((p) => (
                <PrayerCardMine
                  key={p.id}
                  prayer={p}
                  showAnswerButton={true}
                  onAnswer={handleAnswer}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
