import React from "react";
import { THEME_STATUS_LABEL, THEME_STATUS_STYLE } from "@/lib/requests";

export default function MyThemeRequests({ requests, loading }) {
  if (loading) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Chargement de tes demandes…
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
        <p className="text-sm font-semibold text-foreground/80">Aucune demande pour l'instant</p>
        <p className="text-xs text-muted-foreground mt-1">
          Propose un thème ci-dessus : il apparaîtra ici avec son statut.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-border bg-card p-3.5 md:p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="selectable text-sm font-bold break-words text-foreground">
                {r.theme}
              </p>
              {r.passage && (
                <p className="selectable text-xs text-foreground/60 mt-1">
                  📖 {r.passage}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                THEME_STATUS_STYLE[r.status] || THEME_STATUS_STYLE.pending
              }`}
            >
              {THEME_STATUS_LABEL[r.status] || THEME_STATUS_LABEL.pending}
            </span>
          </div>

          {r.admin_note && (
            <div className="mt-3 rounded-xl bg-muted/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Note du responsable
              </p>
              <p className="selectable text-xs text-foreground/80">{r.admin_note}</p>
            </div>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            {r.created_date
              ? `Demandé le ${new Date(r.created_date).toLocaleDateString("fr-FR")}`
              : ""}
            {r.handled_date && r.status !== "pending"
              ? ` · Traité le ${new Date(r.handled_date).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
