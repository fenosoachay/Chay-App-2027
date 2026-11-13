import React, { useEffect, useState } from "react";
import { CheckCircle2, Compass, Loader2, Mail, MapPin, Phone, RotateCcw, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { libelleTypeMission } from "@/lib/missions";

const FILTRES = [
  { value: "nouvelle", label: "Nouvelles" },
  { value: "traitee", label: "Traitées" },
  { value: "", label: "Toutes" },
];

const dateFr = (d) => {
  const t = new Date(String(d || "").replace(" ", "T"));
  return Number.isNaN(t.getTime()) ? "" : t.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
};

// Panneau admin › Engagement › « Se missionner » : demandes envoyées par les membres (collection MissionRequest).
export default function AdminMissions() {
  const { toast } = useToast();
  const [filtre, setFiltre] = useState("nouvelle");
  const [liste, setListe] = useState(null);
  const [occupe, setOccupe] = useState(null);

  const charger = async () => {
    try {
      const rows = await base44.entities.MissionRequest.filter(filtre ? { status: filtre } : {}, "-created_date", 500);
      setListe(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setListe({ erreur: e?.message || "Chargement impossible" });
    }
  };
  useEffect(() => { setListe(null); charger(); }, [filtre]); // eslint-disable-line react-hooks/exhaustive-deps

  const changer = async (m, data) => {
    setOccupe(m.id);
    try {
      await base44.entities.MissionRequest.update(m.id, data);
      await charger();
    } catch (e) {
      toast({ title: "Modification non enregistrée", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe(null);
    }
  };

  const supprimer = async (m) => {
    if (!window.confirm(`Supprimer la demande de ${m.first_name} ${m.last_name} ?`)) return;
    setOccupe(m.id);
    try {
      await base44.entities.MissionRequest.delete(m.id);
      await charger();
    } catch (e) {
      toast({ title: "Suppression impossible", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe(null);
    }
  };

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="font-display text-xl font-extrabold">Se missionner</h2>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer les demandes">
        {FILTRES.map((f) => (
          <button
            key={f.value || "toutes"}
            type="button"
            aria-pressed={filtre === f.value}
            onClick={() => setFiltre(f.value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold ${filtre === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {liste === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : liste.erreur ? (
        <p role="alert" className="text-destructive">Demandes indisponibles : {liste.erreur}. La migration du lot E a-t-elle été appliquée ?</p>
      ) : liste.length === 0 ? (
        <p className="text-foreground/60">Aucune demande.</p>
      ) : (
        <ul className="space-y-3">
          {liste.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold break-words">{m.first_name} {m.last_name} <span className="font-semibold text-foreground/60">· {m.age} ans</span></div>
                  <div className="text-sm font-bold text-primary break-words">
                    {libelleTypeMission(m.kind)}{m.kind === "autre" && m.other_text ? ` : ${m.other_text}` : ""}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${m.status === "traitee" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                  {m.status === "traitee" ? "Traitée" : "Nouvelle"}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-sm text-foreground/80">
                <a href={`tel:${String(m.phone || "").replace(/[^0-9+]/g, "")}`} className="flex items-center gap-2 hover:underline"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{m.phone}</a>
                <div className="flex items-start gap-2 break-words"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{m.address}</div>
              </div>
              {m.details && <p className="mt-2 whitespace-pre-line break-words rounded-xl bg-muted/50 p-3 text-sm">{m.details}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Reçue le {dateFr(m.created_date || m.created)} (e-mail envoyé aux admins)
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {m.status === "traitee" ? (
                  <button type="button" disabled={occupe === m.id} onClick={() => changer(m, { status: "nouvelle" })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-bold">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Remettre en « Nouvelle »
                  </button>
                ) : (
                  <button type="button" disabled={occupe === m.id} onClick={() => changer(m, { status: "traitee" })} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Marquer comme traitée
                  </button>
                )}
                <button type="button" disabled={occupe === m.id} onClick={() => supprimer(m)} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-sm font-bold text-destructive">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
