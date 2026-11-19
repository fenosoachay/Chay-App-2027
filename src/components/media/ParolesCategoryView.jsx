import React, { useState, useEffect, useMemo } from "react";
import { SortAsc, SortDesc, Lock, Unlock, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ParolesCard from "./ParolesCard";
import BlocOrdonnable from "./BlocOrdonnable";
import { enregistrerOrdreChamp } from "@/lib/ordreChamp";
import { useToast } from "@/components/ui/use-toast";

// Section « Paroles » : liste de textes triables (admin par order, membre par date ou titre)
export default function ParolesCategoryView({ category, data, onBack }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState(null);
  const [sortBy, setSortBy] = useState("date"); // "date" | "title" | "order"
  const [sortAsc, setSortAsc] = useState(false);
  const [locked, setLocked] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // Chargement initial
  useEffect(() => {
    let actif = true;
    base44.entities.Paroles.list("-created_date", 200)
      .then((rows) => { if (actif) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (actif) setItems([]); });
    return () => { actif = false; };
  }, []);

  // Tri côté client pour le membre (admin utilise order du serveur)
  const sortedItems = useMemo(() => {
    if (!items) return [];
    const arr = [...items];
    if (isAdmin && !locked) return arr; // admin gère l'ordre manuellement
    if (sortBy === "title") {
      return arr.sort((a, b) => (sortAsc ? 1 : -1) * (a.title || "").localeCompare(b.title || "", "fr"));
    }
    // Par date (défaut)
    return arr.sort((a, b) => (sortAsc ? 1 : -1) * (new Date(b.date || 0) - new Date(a.date || 0)));
  }, [items, sortBy, sortAsc, isAdmin, locked]);

  // Admin : réorganisation par glisser-déposer
  const reordonner = async (next) => {
    if (!isAdmin) return;
    setLoadingOrder(true);
    try {
      setItems(await enregistrerOrdreChamp(next, (id, d) => base44.entities.Paroles.update(id, d)));
      toast({ title: "Ordre enregistré" });
    } catch (e) {
      toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" });
      base44.entities.Paroles.list("-created_date", 200).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch(() => {});
    } finally {
      setLoadingOrder(false);
    }
  };

  const basculerVerrou = () => setLocked(!locked);

  if (items === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête avec tri pour les membres, cadenas pour l'admin */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl">Paroles de chansons</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={basculerVerrou}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition"
              aria-label={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
              aria-pressed={!locked}
            >
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          )}
          {!isAdmin && (
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1 text-foreground/70">
                Trier par :
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-xl border border-border bg-background px-2 py-1 text-sm"
                >
                  <option value="date">Date</option>
                  <option value="title">Titre</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="h-8 w-8 grid place-items-center rounded-full border border-border hover:bg-muted"
                aria-label={sortAsc ? "Ordre croissant" : "Ordre décroissant"}
              >
                {sortAsc ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && !locked ? (
        <BlocOrdonnable
          id="paroles"
          isAdmin
          items={items}
          onReorder={reordonner}
          libelle="les textes"
          vignette={(t) => t.cover_url || null}
          titre={(t) => t.title}
        >
          <div className="space-y-3">
            {sortedItems.map((t) => (
              <ParolesCard key={t.id} texte={t} />
            ))}
          </div>
        </BlocOrdonnable>
      ) : (
        <div className="space-y-3">
          {sortedItems.map((t) => (
            <ParolesCard key={t.id} texte={t} />
          ))}
        </div>
      )}

      {!items.length && (
        <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
          <p className="font-semibold">Aucun texte pour le moment.</p>
          {isAdmin && <p className="text-sm text-foreground/60 mt-1">Créez le premier depuis l'admin.</p>}
        </div>
      )}
    </div>
  );
}