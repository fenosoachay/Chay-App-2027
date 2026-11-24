import React, { useCallback, useEffect, useState } from "react";
import { HandHeart, Loader2, Trash2 } from "lucide-react";
import { appelChay } from "@/api/chayApi";
import { useToast } from "@/components/ui/use-toast";
import { confirmFr } from "@/lib/confirmFr";

// Admin › Application › Contenu › Accueil › « Requêtes » (1.3.25) : sujets de prière confiés par les membres (le
// mur de prière de l'accueil), sans le nom de l'auteur. L'admin peut retirer un sujet inapproprié.
// Les demandes de thème sont dans Communauté › « Demande de thème ».
const STATUTS = { open: "En attente", taken: "Pris en charge", answered: "Répondu", closed: "Clos" };
const formatDate = (iso) => {
  const d = new Date(String(iso || "").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

export default function AdminRequetes() {
  const { toast } = useToast();
  const [items, setItems] = useState(null);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(() => {
    appelChay("/api/chay/admin/requetes")
      .then((r) => setItems(Array.isArray(r?.items) ? r.items : []))
      .catch((e) => { setErreur(e.message); setItems([]); });
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const supprimer = async (it) => {
    if (!(await confirmFr("Retirer ce sujet de prière du mur ?"))) return;
    try {
      await appelChay("/api/chay/admin/requetes/supprimer", { methode: "POST", corps: { id: it.id } });
      setItems((l) => l.filter((x) => x.id !== it.id));
    } catch (e) {
      toast({ title: "Non retiré", description: e.message, variant: "destructive" });
    }
  };

  if (items === null) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const attente = items.filter((i) => i.statut === "open").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Sujets de prière confiés par les membres ({items.length}, dont {attente} en attente). Le nom de l'auteur n'est pas affiché.
      </p>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {!items.length && !erreur && <p className="py-6 text-sm text-foreground/50">Aucun sujet de prière.</p>}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
              <HandHeart className="h-4 w-4 text-primary" />
              <span>{formatDate(it.date)}</span>
              {it.categorie && <span>· {it.categorie}</span>}
              <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 font-bold">{STATUTS[it.statut] || it.statut || "—"}</span>
              <button type="button" onClick={() => supprimer(it)} title="Retirer" className="grid h-8 w-8 place-items-center rounded-full border border-red-200 text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="selectable mt-2 whitespace-pre-line text-sm">{it.contenu}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
