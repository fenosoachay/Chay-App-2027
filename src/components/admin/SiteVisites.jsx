import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { totauxVisites } from "@/lib/visitesSite";

// Admin › Site · Visites : nombre de visites de chay.fr (une visite = une personne, comptée à nouveau
// après 30 minutes d'absence). Une ligne SiteVisite par jour, écrite par le serveur.
export default function SiteVisites() {
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    base44.entities.SiteVisite.list("-jour", 400)
      .then((r) => { if (vivant) setLignes(Array.isArray(r) ? r : []); })
      .catch(() => { if (vivant) setErreur(true); });
    return () => { vivant = false; };
  }, []);

  if (erreur) return <p className="p-4 text-sm text-red-600">Impossible de lire les visites pour le moment.</p>;
  if (!lignes) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-foreground/50" /></div>;

  const t = totauxVisites(lignes, new Date());
  const cartes = [
    ["Aujourd'hui", t.jour],
    ["Cette semaine", t.semaine],
    ["Ce mois", t.mois],
    ["Cette année", t.annee],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Visites du site chay.fr</h2>
        <p className="text-sm text-foreground/60">Une visite = une personne ; elle est comptée à nouveau après 30 minutes d'absence.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartes.map(([libelle, n]) => (
          <div key={libelle} className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground/55">{libelle}</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">{n.toLocaleString("fr-FR")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
