import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ParolesCard from "./ParolesCard";

const sansAccents = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Section « Paroles » : paroles des chansons chantées à l'Église, toujours dans l'ordre alphabétique des titres,
// avec une recherche par titre.
export default function ParolesCategoryView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState(null);
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let actif = true;
    base44.entities.Paroles.list("-created_date", 500)
      .then((rows) => { if (actif) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (actif) setItems([]); });
    return () => { actif = false; };
  }, []);

  const affiches = useMemo(() => {
    const terme = sansAccents(recherche).trim();
    return [...(items || [])]
      .filter((t) => !terme || sansAccents(t.title).includes(terme))
      .sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base", numeric: true }));
  }, [items, recherche]);

  if (items === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-foreground/70">
        Vous trouverez ici les paroles de toutes les chansons chantées à l'Église. Bonne lecture !
      </p>

      <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un titre…"
          aria-label="Rechercher un titre"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>

      <div className="space-y-3">
        {affiches.map((t) => (
          <ParolesCard key={t.id} texte={t} />
        ))}
      </div>

      {items.length > 0 && affiches.length === 0 && (
        <p className="py-8 text-center text-foreground/50">Aucun titre ne correspond à votre recherche.</p>
      )}
      {!items.length && (
        <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
          <p className="font-semibold">Aucune parole pour le moment.</p>
          {isAdmin && <p className="text-sm text-foreground/60 mt-1">Ajoutez la première depuis l'admin.</p>}
        </div>
      )}
    </div>
  );
}
