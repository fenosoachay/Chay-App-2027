import React from "react";
import { ChevronRight } from "lucide-react";

// Fil d'Ariane : Accueil > Lettre > Mot > Livre. `crumbs` = [{ label, onClick }] ;
// le dernier élément est l'écran courant (non cliquable).
export default function ConcordanceBreadcrumb({ crumbs }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 px-4 py-2 text-xs">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            {last ? (
              <span className="font-bold text-foreground">{c.label}</span>
            ) : (
              <button onClick={c.onClick} className="font-semibold text-primary hover:underline">
                {c.label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}