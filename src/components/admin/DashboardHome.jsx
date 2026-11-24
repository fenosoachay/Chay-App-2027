import React, { lazy, Suspense, useEffect, useState } from "react";
import { Clock, Loader2, MapPin, RefreshCw, Sparkles, TrendingUp, UserPlus, Users } from "lucide-react";
import { appelChay } from "@/api/chayApi";
import { AlerteJeuxNonClasses } from "@/components/admin/JeuxCategoriesAdmin";
import { dureeLisible } from "@/lib/statsApp";

const CarteMembres = lazy(() => import("@/components/admin/CarteMembres"));

const PERIODES = [
  ["aujourdhui", "Aujourd'hui"],
  ["semaine", "Cette semaine"],
  ["mois", "Ce mois"],
];

function Carte({ children, className = "" }) {
  return <div className={`rounded-[1.5rem] border border-border bg-card p-5 ${className}`}>{children}</div>;
}

// Administration › Application › « Tableau de bord » (1.3.25) : connectés et nouveaux membres (aujourd'hui, semaine
// depuis lundi, mois), temps moyen d'utilisation, sections les plus visitées et carte des membres.
// Chiffres calculés par le serveur (GET /api/chay/admin/stats) à partir de ce que l'app envoie depuis la 1.3.25.
export default function DashboardHome({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  const charger = () => {
    setChargement(true);
    setErreur("");
    appelChay("/api/chay/admin/stats")
      .then(setStats)
      .catch((e) => setErreur(e.message || "Statistiques indisponibles"))
      .finally(() => setChargement(false));
  };
  useEffect(() => { charger(); }, []);

  const maxSection = Math.max(1, ...(stats?.sections || []).map((s) => s.visites));

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] brand-gradient p-7 md:p-9 text-white glow-primary relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3 mb-2">
          <Sparkles className="h-6 w-6" />
          <span className="text-xs font-bold uppercase tracking-wide bg-white/15 px-3 py-1 rounded-full">Tableau de bord</span>
          <button
            type="button"
            onClick={charger}
            aria-label="Actualiser"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25 transition"
          >
            <RefreshCw className={`h-4 w-4 ${chargement ? "animate-spin" : ""}`} />
          </button>
        </div>
        <h2 className="relative font-display font-extrabold text-3xl md:text-4xl mt-2">L'application en un coup d'œil</h2>
        {stats && (
          <p className="relative text-white/85 mt-2">
            {stats.total.toLocaleString("fr-FR")} membre{stats.total > 1 ? "s" : ""} au total
          </p>
        )}
      </div>

      {erreur && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{erreur}</p>}
      {!stats && !erreur && (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PERIODES.map(([cle, libelle]) => {
              const p = stats[cle];
              return (
                <Carte key={cle}>
                  <div className="text-xs font-bold uppercase tracking-wide text-foreground/55">{libelle}</div>
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground/70">
                    <Users className="h-4 w-4 text-primary" /> Connectés
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-extrabold tabular-nums">{p.connectes.toLocaleString("fr-FR")}</span>
                    <span className="text-sm text-foreground/55">/ {stats.total.toLocaleString("fr-FR")} · {p.part} %</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full brand-gradient" style={{ width: `${Math.min(100, p.part)}%` }} />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <UserPlus className="h-4 w-4 text-emerald-500" />
                    <span className="font-bold tabular-nums">{p.nouveaux.toLocaleString("fr-FR")}</span>
                    <span className="text-foreground/60">nouveau{p.nouveaux > 1 ? "x" : ""} membre{p.nouveaux > 1 ? "s" : ""}</span>
                  </div>
                </Carte>
              );
            })}
          </div>

          <Carte className="p-3 md:p-4">
            <div className="flex items-center gap-2 px-2 pb-3 text-sm font-semibold text-foreground/70">
              <MapPin className="h-4 w-4 text-primary" /> Où sont les membres
              <span className="ml-auto text-xs font-normal text-foreground/50">
                {stats.carte.length} membre{stats.carte.length > 1 ? "s" : ""} · position à la ville près
              </span>
            </div>
            <Suspense fallback={<div className="flex h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
              <CarteMembres points={stats.carte} />
            </Suspense>
          </Carte>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
            <Carte>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                <Clock className="h-4 w-4 text-primary" /> Temps moyen d'utilisation
              </div>
              <div className="mt-2 font-display text-3xl font-extrabold">{dureeLisible(stats.tempsMoyenSecondes)}</div>
              <p className="mt-1 text-xs text-foreground/55">par membre et par jour d'utilisation, ce mois-ci</p>
            </Carte>
            <Carte>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                <TrendingUp className="h-4 w-4 text-primary" /> Sections les plus visitées (ce mois)
              </div>
              {stats.sections.length ? (
                <ul className="mt-3 space-y-2">
                  {stats.sections.slice(0, 6).map((s, i) => (
                    <li key={s.id} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
                      <span className={`truncate ${i === 0 ? "font-bold" : ""}`}>{s.nom}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full brand-gradient" style={{ width: `${(s.visites / maxSection) * 100}%` }} />
                      </span>
                      <span className="tabular-nums text-foreground/60">{s.visites.toLocaleString("fr-FR")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-foreground/55">Pas encore de visites enregistrées (l'app les envoie depuis la version 1.3.25).</p>
              )}
            </Carte>
          </div>
        </>
      )}

      <AlerteJeuxNonClasses onNavigate={onNavigate} />
    </div>
  );
}
