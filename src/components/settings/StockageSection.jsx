import React, { useCallback, useEffect, useState } from "react";
import { HardDrive, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { octetsLisibles } from "@/lib/stockage";

// Stockage et données (1.3.34) : place utilisée par l'application sur cet appareil, et vidage du cache
// (Bible hors ligne, dictionnaire, listes en mémoire). Rien de personnel n'est effacé : compte, préférences,
// messages en attente d'envoi, progrès des jeux et notes restent.
const CLES_CACHE = ["chay_youtube_list_v1"];

export default function StockageSection() {
  const { toast } = useToast();
  const [estimation, setEstimation] = useState(null); // { usage, quota } | false (indisponible)
  const [vidage, setVidage] = useState(false);

  const mesurer = useCallback(async () => {
    try {
      const e = await globalThis.navigator?.storage?.estimate?.();
      setEstimation(e && Number.isFinite(e.usage) ? e : false);
    } catch {
      setEstimation(false);
    }
  }, []);
  useEffect(() => { mesurer(); }, [mesurer]);

  const vider = async () => {
    setVidage(true);
    try {
      if (typeof caches !== "undefined") {
        const noms = await caches.keys();
        await Promise.all(noms.map((n) => caches.delete(n)));
      }
      for (const k of CLES_CACHE) { try { localStorage.removeItem(k); } catch { /* rien */ } }
      toast({ title: "Cache vidé", description: "La Bible et le dictionnaire se rechargeront quand vous les ouvrirez." });
    } catch {
      toast({ title: "Impossible de vider le cache", variant: "destructive" });
    } finally {
      setVidage(false);
      mesurer();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <HardDrive className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Espace utilisé sur cet appareil</span>
          <span className="block text-sm text-foreground/60">
            {estimation === null ? "Calcul…" : estimation === false ? "Non disponible sur cet appareil" : octetsLisibles(estimation.usage)}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={vider}
        disabled={vidage}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary disabled:opacity-60"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground/70">
          {vidage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Vider le cache</span>
          <span className="block text-xs text-foreground/55">Libère de la place. Votre compte, vos notes et vos progrès restent.</span>
        </span>
      </button>
    </div>
  );
}
