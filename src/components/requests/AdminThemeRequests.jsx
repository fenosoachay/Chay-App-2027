import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, MessageSquareQuote, User } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  handleThemeRequest,
  fetchAdminThemeRequests,
  THEME_STATUS_LABEL,
  THEME_STATUS_STYLE,
  isDesignatedAdminFrontend,
} from "@/lib/requests";

const FILTERS = [
  { key: "all", label: "Toutes", status: null },
  { key: "pending", label: "En attente", status: "pending" },
  { key: "validated", label: "Validées", status: "validated" },
  { key: "declined", label: "Non retenues", status: "declined" },
];

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function RequestCard({ request, onAction, busy }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const isPending = request.status === "pending";
  const isBusy = busy === request.id;

  const handle = (decision) => {
    onAction(request.id, decision, note.trim());
    setNote("");
    setShowNote(false);
  };

  return (
    <li className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="selectable text-sm font-bold break-words text-foreground">
            {request.theme}
          </p>
          {request.passage && (
            <p className="selectable text-xs text-foreground/60 mt-1">📖 {request.passage}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            THEME_STATUS_STYLE[request.status] || THEME_STATUS_STYLE.pending
          }`}
        >
          {THEME_STATUS_LABEL[request.status] || request.status}
        </span>
      </div>

      {request.user_id && (
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <User className="h-3 w-3" />
          <Link to={`/profile/${request.user_id}`} className="text-primary hover:underline">
            Voir le profil
          </Link>
          <span className="mx-1">·</span>
          📅 {formatDate(request.created_date)}
        </p>
      )}

      {request.admin_note && (
        <div className="mt-2 rounded-xl bg-muted/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Ta note
          </p>
          <p className="selectable text-xs text-foreground/80">{request.admin_note}</p>
        </div>
      )}

      {isPending && (
        <div className="mt-4 space-y-3">
          {showNote ? (
            <div className="space-y-2">
              <Label htmlFor={`note-${request.id}`} className="text-xs font-semibold">
                Note facultative (visible par le demandeur)
              </Label>
              <Textarea
                id={`note-${request.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Explication rapide, références…"
                className="selectable resize-none text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handle("validated")}
                  disabled={isBusy}
                  className="brand-gradient text-white border-0 text-sm"
                  size="sm"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Valider
                </Button>
                <Button
                  onClick={() => handle("declined")}
                  disabled={isBusy}
                  variant="secondary"
                  size="sm"
                  className="text-sm"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <X className="h-3.5 w-3.5 mr-1" />}
                  Ne pas retenir
                </Button>
                <Button
                  onClick={() => { setShowNote(false); setNote(""); }}
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handle("validated")}
                disabled={isBusy}
                className="brand-gradient text-white border-0 text-sm"
                size="sm"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Valider
              </Button>
              <Button
                onClick={() => handle("declined")}
                disabled={isBusy}
                variant="secondary"
                size="sm"
                className="text-sm"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <X className="h-3.5 w-3.5 mr-1" />}
                Ne pas retenir
              </Button>
              <Button
                onClick={() => setShowNote(true)}
                variant="ghost"
                size="sm"
                className="text-sm"
              >
                + Ajouter une note
              </Button>
            </div>
          )}
        </div>
      )}

      {!isPending && request.handled_date && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Traité le {formatDate(request.handled_date)}
        </p>
      )}
    </li>
  );
}

export default function AdminThemeRequests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [activeFilter, setActiveFilter] = useState("pending");
  const [isAuthorized, setIsAuthorized] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const filter = FILTERS.find((f) => f.key === activeFilter);
      const rows = await fetchAdminThemeRequests(filter?.status || null);
      setRequests(rows);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, user?.id]);

  // Vérifie si cet admin est autorisé (pas le créateur)
  useEffect(() => {
    let alive = true;
    async function check() {
      if (!user?.id) return;
      const ok = await isDesignatedAdminFrontend(base44, user.id);
      if (alive) setIsAuthorized(ok);
    }
    check();
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  const handleAction = async (requestId, decision, adminNote) => {
    setBusy(requestId);
    try {
      await handleThemeRequest({
        request_id: requestId,
        decision,
        admin_note: adminNote,
      });
      toast({
        title: decision === "validated" ? "Demande validée" : "Demande non retenue",
        description: "Le demandeur a été notifié.",
      });
      await load();
    } catch (e) {
      toast({ title: "Action impossible", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Cas : pas encore vérifié
  if (isAuthorized === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Cas : créateur de l'app — accès refusé
  if (!isAuthorized) {
    return (
      <section className="rounded-[2rem] border border-border bg-background/40 p-10 text-center">
        <div className="mx-auto grid place-items-center h-14 w-14 rounded-2xl bg-muted mb-4">
          <MessageSquareQuote className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="font-display font-extrabold text-xl mb-2">Demandes de thème</h2>
        <p className="text-foreground/60 max-w-md mx-auto">
          Cette section est réservée aux administrateurs désignés pour traiter les demandes.
          En tant que créateur de l'application, tu n'as pas accès aux demandes de thème
          pour garantir l'indépendance du traitement.
        </p>
      </section>
    );
  }

  const filteredRequests = activeFilter === "all"
    ? requests
    : requests.filter((r) => r.status === activeFilter);

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === "all"
      ? requests.length
      : requests.filter((r) => r.status === f.status).length;
    return acc;
  }, {});

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-5 flex items-center gap-2">
        <MessageSquareQuote className="h-5 w-5 text-primary" />
        <h2 className="font-display font-extrabold text-xl">Demandes de thème</h2>
      </div>

      <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
        <TabsList className="w-full grid grid-cols-4 mb-5">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="text-xs md:text-sm font-semibold">
              {f.label}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({counts[f.key] || 0})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {FILTERS.map((f) => (
          <TabsContent key={f.key} value={f.key} className="mt-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
                <p className="text-sm font-semibold text-foreground/80">
                  Aucune demande{f.key !== "all" ? ` dans « ${f.label} »` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Les nouvelles demandes apparaîtront ici.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredRequests.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    onAction={handleAction}
                    busy={busy}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
