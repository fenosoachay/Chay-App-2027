import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Loader2, Wrench } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Admin › Engagement › « Problèmes techniques » (1.3.22) : réservé au responsable technique (users.responsable_technique).
// « Réglé » + petit message : le membre reçoit automatiquement, de la part de « Chay » (sans réponse possible) :
// « Shalom, le problème technique que vous avez signalé au responsable a été résolu, voici le message du
//   responsable : « … » ».
const formatDate = (iso) => {
  const d = new Date(String(iso || "").replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Signalement({ s, onRegle }) {
  const { toast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [reponse, setReponse] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const regler = async () => {
    setEnvoi(true);
    try {
      await base44.functions.invoke("reglerSignalement", { id: s.id, reponse: reponse.trim() });
      toast({ title: "Réglé", description: "Le membre a reçu votre message dans ses messages." });
      onRegle();
    } catch (e) {
      toast({ title: "Non enregistré", description: (typeof e?.data?.error === "string" && e.data.error) || "Réessayez.", variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  const regle = s.statut === "regle";
  return (
    <li className={`rounded-2xl border bg-card p-4 ${regle ? "border-border opacity-75" : "border-primary/40"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link to={`/profile/${s.user_id}`} className="font-bold text-primary underline">{s.username || "Membre"}</Link>
        <span className="text-foreground/50">· {formatDate(s.created)}</span>
        {s.plateforme && <span className="text-foreground/50">· {s.plateforme}</span>}
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${regle ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
          {regle ? "Réglé" : "À régler"}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm">{s.message}</p>
      {s.capture_url && (
        <a href={s.capture_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          <img src={s.capture_url} alt="Capture d'écran du membre" className="h-32 rounded-xl border border-border object-cover" />
        </a>
      )}
      {regle ? (
        <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm text-foreground/70">
          Réglé le {formatDate(s.regle_le)}{s.reponse ? <> · votre message : « {s.reponse} »</> : null}
        </p>
      ) : ouvert ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={reponse}
            onChange={(e) => setReponse(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Petit message pour le membre (ex. : c'est corrigé, mettez l'application à jour)"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-xs text-foreground/50">
            Le membre recevra de « Chay » : « Shalom, le problème technique que vous avez signalé au responsable a été résolu,
            voici le message du responsable : « {reponse.trim() || "…"} » ».
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOuvert(false)} disabled={envoi} className="flex-1 rounded-full border border-border px-4 py-2 text-sm font-semibold">
              Annuler
            </button>
            <button type="button" onClick={regler} disabled={envoi} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Envoyer et marquer réglé
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOuvert(true)} className="mt-3 inline-flex items-center gap-2 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white">
          <CheckCircle className="h-4 w-4" /> Réglé
        </button>
      )}
    </li>
  );
}

export default function SignalementsTechniques() {
  const [items, setItems] = useState(null);
  const [refus, setRefus] = useState(false);
  const [filtre, setFiltre] = useState("ouvert");

  const charger = useCallback(async () => {
    try {
      const r = await base44.functions.invoke("listerSignalements", {});
      setItems(Array.isArray(r?.data?.items) ? r.data.items : []);
    } catch (e) {
      if (e?.status === 403) setRefus(true);
      setItems([]);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const liste = (items || []).filter((s) => filtre === "tous" || (filtre === "ouvert" ? s.statut !== "regle" : s.statut === "regle"));
  const nbOuverts = (items || []).filter((s) => s.statut !== "regle").length;

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-extrabold">Problèmes techniques</h2>
      </div>
      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : refus ? (
        <p className="py-8 text-center text-foreground/60">Réservé au responsable technique.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {[["ouvert", `À régler (${nbOuverts})`], ["regle", "Réglés"], ["tous", "Tous"]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltre(id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filtre === id ? "bg-primary text-primary-foreground" : "border border-border"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {liste.length === 0 ? (
            <p className="py-8 text-center text-foreground/60">{filtre === "ouvert" ? "Aucun problème à régler. 🙏" : "Aucun signalement."}</p>
          ) : (
            <ul className="space-y-3">
              {liste.map((s) => <Signalement key={s.id} s={s} onRegle={charger} />)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
