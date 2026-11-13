import React from "react";
import { Eye } from "lucide-react";
import { useCompteur } from "@/hooks/useCompteurVues";
import { formatVues } from "@/lib/vues";

/** Compteur de vues discret (« 1,2 k vues ») ; rien tant qu'il n'y a aucune vue. */
export default function CompteurVues({ vue, base, unite = "vue", className = "" }) {
  const texte = formatVues(useCompteur(vue, base), unite);
  if (!texte) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[0.6875rem] font-medium text-foreground/50 ${className}`}>
      <Eye className="h-3 w-3" aria-hidden="true" />
      {texte}
    </span>
  );
}
