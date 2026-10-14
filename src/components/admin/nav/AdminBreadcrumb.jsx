import React from "react";
import { ChevronRight } from "lucide-react";
import { findNav } from "@/components/admin/nav/adminNavConfig";

// Administration > Multimédia > Musique
export default function AdminBreadcrumb({ active, onHome }) {
  const { group, item } = findNav(active);
  return (
    <nav aria-label="Fil d'Ariane" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-foreground/60">
      <button onClick={onHome} className="font-semibold hover:text-primary transition-colors">Administration</button>
      {group && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>{group.label}</span>
        </>
      )}
      {item.key !== "overview" && (
        <>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-bold text-foreground">{item.label}</span>
        </>
      )}
    </nav>
  );
}