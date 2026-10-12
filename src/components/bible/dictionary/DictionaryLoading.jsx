import React from "react";
import { Loader2, RefreshCw } from "lucide-react";

// État de chargement / téléchargement initial (une seule fois) et erreur.
export default function DictionaryLoading({ status, progress, error, onRetry }) {
  if (status === "error") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-6">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }
  const pct = progress != null ? Math.round(progress * 100) : null;
  return (
    <div className="px-4 py-8">
      <p className="flex items-center gap-2 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        {pct != null && pct < 100
          ? `Téléchargement du dictionnaire (premier lancement)… ${pct} %`
          : "Préparation du dictionnaire…"}
      </p>
      {pct != null && pct < 100 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full brand-gradient transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}