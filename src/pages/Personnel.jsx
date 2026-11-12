import React, { useEffect, useState } from "react";
import { Loader2, UserSquare } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { trierPersonnel, initiales } from "@/lib/menuEglise";

// Menu ☰ > « Personnel » : membres du staff (nom, rôle, photo), dans l'ordre choisi par l'admin.
export default function Personnel() {
  const [liste, setListe] = useState(null);

  useEffect(() => {
    base44.entities.StaffMember.list("order", 500)
      .then((rows) => setListe(trierPersonnel(rows)))
      .catch(() => setListe([]));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-3">
        <span className="h-11 w-11 shrink-0 rounded-2xl brand-gradient grid place-items-center text-white">
          <UserSquare className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="font-display font-extrabold text-3xl">
          <span className="brand-gradient-text">Personnel</span>
        </h1>
      </header>

      {liste === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : liste.length === 0 ? (
        <p className="text-foreground/60">La liste du personnel sera bientôt publiée.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {liste.map((p) => (
            <li key={p.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
              {p.photo_url ? (
                <img src={p.photo_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-full object-cover bg-muted" />
              ) : (
                <span className="h-16 w-16 shrink-0 rounded-full brand-gradient grid place-items-center text-white font-bold text-lg" aria-hidden="true">
                  {initiales(p.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold break-words">{p.name}</div>
                {p.role && <div className="text-sm text-foreground/60 break-words">{p.role}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
