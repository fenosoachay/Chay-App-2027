import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareQuote, ChevronRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";

export default function RequestsSection({ refreshKey = 0 }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const res = await base44.functions.invoke("getPrayerWall", {});
        if (alive) {
          setPendingCount(res?.data?.count || res?.data?.items?.length || 0);
        }
      } catch {
        if (alive) setPendingCount(0);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [refreshKey, isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <section className="animate-float-in" style={{ animationDelay: "0.27s" }}>
      <div className="rounded-[1.5rem] md:rounded-[2rem] border border-border bg-card p-5 md:p-7 relative overflow-hidden">
        {/* Effet de dégradé subtil en coin */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full brand-gradient opacity-10 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="grid place-items-center h-10 w-10 md:h-11 md:w-11 rounded-2xl brand-gradient text-white shadow-lg">
              <MessageSquareQuote className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-extrabold text-base md:text-lg text-foreground">
                Requêtes
              </h2>
              <p className="text-xs md:text-sm text-foreground/60">
                Propose un thème ou confie un sujet de prière.
              </p>
            </div>
            <Button
              onClick={() => navigate("/requests")}
              className="brand-gradient text-white border-0 hover:opacity-90 text-xs md:text-sm font-bold rounded-xl shrink-0"
              size="sm"
            >
              Y accéder
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Ligne : X prières attendent */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs md:text-sm text-foreground/70">
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Chargement…
                </span>
              ) : pendingCount > 0 ? (
                <span>
                  <strong className="text-foreground">{pendingCount}</strong> prière
                  {pendingCount > 1 ? "s" : ""} attendent quelqu'un
                </span>
              ) : (
                <span>Aucune prière en attente</span>
              )}
            </div>
            <button
              onClick={() => navigate("/requests?tab=prayer")}
              className="inline-flex items-center gap-0.5 text-xs font-bold text-primary hover:text-primary/80 transition"
            >
              Voir
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
