import React, { useState, useEffect, useMemo } from "react";
import { SortAsc, SortDesc, Lock, Unlock, BookOpen, Calendar, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerOrdreChamp } from "@/lib/ordreChamp";
import { useToast } from "@/components/ui/use-toast";
import TexteRiche from "./TexteRiche";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Section « Verset » : identique à Paroles + champ référence biblique
export default function VersetCategoryView({ category, data, onBack }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [locked, setLocked] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(false);

  useEffect(() => {
    let actif = true;
    base44.entities.Verset.list("-created_date", 200)
      .then((rows) => { if (actif) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (actif) setItems([]); });
    return () => { actif = false; };
  }, []);

  const sortedItems = useMemo(() => {
    if (!items) return [];
    const arr = [...items];
    if (isAdmin && !locked) return arr;
    if (sortBy === "title") {
      return arr.sort((a, b) => (sortAsc ? 1 : -1) * (a.title || "").localeCompare(b.title || "", "fr"));
    }
    return arr.sort((a, b) => (sortAsc ? 1 : -1) * (new Date(b.date || 0) - new Date(a.date || 0)));
  }, [items, sortBy, sortAsc, isAdmin, locked]);

  const reordonner = async (next) => {
    if (!isAdmin) return;
    setLoadingOrder(true);
    try {
      setItems(await enregistrerOrdreChamp(next, (id, d) => base44.entities.Verset.update(id, d)));
      toast({ title: "Ordre enregistré" });
    } catch (e) {
      toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" });
      base44.entities.Verset.list("-created_date", 200).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch(() => {});
    } finally {
      setLoadingOrder(false);
    }
  };

  const basculerVerrou = () => setLocked(!locked);

  if (items === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Versets du dimanche
        </h2>
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

      <div className="space-y-3">
        {sortedItems.map((t) => (
          <VersetCard key={t.id} verset={t} />
        ))}
      </div>

      {!items.length && (
        <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center">
          <p className="font-semibold">Aucun verset pour le moment.</p>
          {isAdmin && <p className="text-sm text-foreground/60 mt-1">Créez le premier depuis l'admin.</p>}
        </div>
      )}
    </div>
  );
}

// Carte pour un verset
function VersetCard({ verset }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = searchParams.get("verset") === verset.id;
  const date = formatDate(verset.date);

  const setOpen = (v) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("verset", verset.id);
    else next.delete("verset");
    setSearchParams(next, { replace: !v });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lire le verset : ${verset.title || "sans titre"}`}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h3 className="w-full break-words font-display font-bold text-base leading-snug text-foreground">
          {verset.title || "Sans titre"}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3">
          {date && (
            <span className="flex items-center gap-1 text-xs text-foreground/50">
              <Calendar className="h-3 w-3" /> {date}
            </span>
          )}
          {verset.reference && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <BookOpen className="h-3 w-3" /> {verset.reference}
            </span>
          )}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto sm:rounded-3xl">
          <DialogTitle className="sr-only">{verset.title}</DialogTitle>
          <div className="pr-7">
            {verset.body ? (
              <TexteRiche html={verset.body} />
            ) : (
              <p className="text-sm text-foreground/50 italic">Ce verset ne contient pas encore de contenu.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}