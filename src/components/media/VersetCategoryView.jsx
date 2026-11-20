import React, { useState, useEffect, useMemo } from "react";
import { BookOpen, Calendar, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerReglage, useReglageMedia } from "@/hooks/useReglageMedia";
import { useToast } from "@/components/ui/use-toast";
import TexteRiche from "./TexteRiche";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Section « Verset » : versets prêchés, du plus récent au plus ancien ou l'inverse (ordre choisi par l'admin,
// le même pour tous les membres).
const CLE_REGLAGE = "reglage:verset";
const dateDe = (v) => new Date(v.date || v.created_date || 0).getTime() || 0;

export default function VersetCategoryView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState(null);
  const reglage = useReglageMedia(CLE_REGLAGE);
  const ancienDabord = reglage.ordre === "ancien";

  useEffect(() => {
    let actif = true;
    base44.entities.Verset.list("-created_date", 500)
      .then((rows) => { if (actif) setItems(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (actif) setItems([]); });
    return () => { actif = false; };
  }, []);

  const sortedItems = useMemo(
    () => [...(items || [])].sort((a, b) => (ancienDabord ? dateDe(a) - dateDe(b) : dateDe(b) - dateDe(a))),
    [items, ancienDabord]
  );

  const changerOrdre = (ordre) => {
    enregistrerReglage(CLE_REGLAGE, { ordre })
      .catch((e) => toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" }));
  };

  if (items === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Versets du dimanche
        </h2>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-foreground/70">
            Ordre pour tous :
            <select
              value={ancienDabord ? "ancien" : "recent"}
              onChange={(e) => changerOrdre(e.target.value)}
              className="rounded-xl border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="recent">Plus récents d'abord</option>
              <option value="ancien">Plus anciens d'abord</option>
            </select>
          </label>
        )}
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
  // Ouverture gardée ici (et non dans l'adresse) : changer l'adresse rechargeait la page Multimédia et la fenêtre
  // s'ouvrait puis se refermait aussitôt (clignotement). Un lien ?verset= (notification) l'ouvre une fois.
  const [open, setOpenLocal] = useState(() => searchParams.get("verset") === verset.id);
  const date = formatDate(verset.date);

  const setOpen = (v) => {
    setOpenLocal(Boolean(v));
    if (!v && searchParams.get("verset")) {
      const next = new URLSearchParams(searchParams);
      next.delete("verset");
      setSearchParams(next, { replace: true });
    }
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