import React from "react";
import { Lock, LockOpen } from "lucide-react";

// Cadenas de réorganisation (admin), même rendu que celui de la gestion YouTube : fermé = ordre figé ; ouvert =
// glisser-déposer au doigt (ListeTriable). Chaque déplacement est enregistré tout de suite et vu par les membres.
export default function CadenasOrdre({ verrouille, onBascule, libelle = "la liste", className = "" }) {
  return (
    <button
      type="button"
      onClick={onBascule}
      title={verrouille ? `Déverrouiller pour réorganiser ${libelle}` : `Verrouiller l'ordre de ${libelle}`}
      aria-label={verrouille ? `Déverrouiller pour réorganiser ${libelle}` : `Verrouiller l'ordre de ${libelle}`}
      aria-pressed={!verrouille}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-90 ${
        verrouille ? "border-border bg-card text-foreground/70 hover:bg-muted" : "border-primary bg-primary/10 text-primary"
      } ${className}`}
    >
      {verrouille ? <Lock className="h-5 w-5" aria-hidden="true" /> : <LockOpen className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
