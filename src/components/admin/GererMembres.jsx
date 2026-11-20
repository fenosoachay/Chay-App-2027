import React, { useEffect, useMemo, useState } from "react";
import { Crown, Loader2, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { NIVEAUX } from "@/lib/audience";

// Admin › Équipe › Gérer les membres : niveau de chaque compte (Utilisateur / Membre / VIP).
// Les membres ne voient pas leur niveau ; il décide des contenus qu'ils voient et des notifications reçues.
// Par défaut, tout compte est « Utilisateur ». Les admins voient tout, quel que soit leur niveau.
const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nomDe = (m) => [m.prenom, m.nom].filter(Boolean).join(" ") || m.email || "Membre";

const STYLE_NIVEAU = {
  tous: "border-border bg-card text-foreground",
  membre: "border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  vip: "border-[#C9A227] bg-[#C9A227]/15 text-[#8a6d00] dark:text-[#F2C94C]",
};

export default function GererMembres() {
  const { toast } = useToast();
  const [membres, setMembres] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("tous-les-comptes");
  const [enCours, setEnCours] = useState(null);

  const charger = () => {
    base44.functions.invoke("listerNiveaux", {})
      .then((r) => setMembres(Array.isArray(r?.data?.membres) ? r.data.membres : []))
      .catch((e) => { setMembres([]); toast({ title: "Liste indisponible", description: e?.message, variant: "destructive" }); });
  };
  useEffect(charger, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changer = async (m, niveau) => {
    if (m.niveau === niveau) return;
    setEnCours(m.id);
    try {
      await base44.functions.invoke("definirNiveau", { user_id: m.id, niveau });
      setMembres((l) => l.map((x) => (x.id === m.id ? { ...x, niveau } : x)));
    } catch (e) {
      toast({ title: "Niveau non enregistré", description: e?.message, variant: "destructive" });
    } finally {
      setEnCours(null);
    }
  };

  const compte = useMemo(() => {
    const c = { tous: 0, membre: 0, vip: 0 };
    (membres || []).forEach((m) => { c[m.niveau || "tous"] = (c[m.niveau || "tous"] || 0) + 1; });
    return c;
  }, [membres]);

  const visibles = useMemo(() => {
    const mots = simplifier(recherche).split(/\s+/).filter(Boolean);
    return (membres || [])
      .filter((m) => filtre === "tous-les-comptes" || (m.niveau || "tous") === filtre)
      .filter((m) => !mots.length || mots.every((w) => simplifier(`${nomDe(m)} ${m.email}`).includes(w)))
      .sort((a, b) => nomDe(a).localeCompare(nomDe(b), "fr", { sensitivity: "base" }));
  }, [membres, recherche, filtre]);

  if (membres === null) return <div className="grid place-items-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Choisissez le niveau de chaque compte. <b>Utilisateur</b> voit les contenus pour les utilisateurs ;
        <b> Membre</b> voit aussi ceux des membres ; <b>VIP</b> voit tout. Les membres ne voient pas leur niveau.
      </p>

      <div className="flex flex-wrap gap-2">
        {[["tous-les-comptes", `Tous les comptes (${membres.length})`], ["tous", `Utilisateurs (${compte.tous})`], ["membre", `Membres (${compte.membre})`], ["vip", `VIP (${compte.vip})`]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltre(id)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${filtre === id ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom ou un e-mail…"
          className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {recherche && (
          <button type="button" onClick={() => setRecherche("")} aria-label="Effacer" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-foreground/50 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {visibles.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
            {m.photo ? (
              <img src={m.photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted"><UserRound className="h-5 w-5 text-foreground/50" /></span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold">{nomDe(m)}</span>
                {m.role === "admin" && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-bold text-primary"><ShieldCheck className="h-3 w-3" /> Admin</span>}
                {m.niveau === "vip" && <Crown className="h-4 w-4 shrink-0 text-[#C9A227]" aria-label="VIP" />}
              </div>
              <div className="truncate text-xs text-foreground/55">{m.email}</div>
            </div>
            <div className="flex shrink-0 gap-1" role="group" aria-label={`Niveau de ${nomDe(m)}`}>
              {NIVEAUX.map((n) => (
                <button
                  key={n.value}
                  type="button"
                  disabled={enCours === m.id}
                  onClick={() => changer(m, n.value)}
                  aria-pressed={(m.niveau || "tous") === n.value}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                    (m.niveau || "tous") === n.value ? STYLE_NIVEAU[n.value] : "border-transparent text-foreground/50 hover:bg-muted"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!visibles.length && <p className="p-6 text-center text-sm text-foreground/50">Aucun compte.</p>}
      </div>
    </div>
  );
}
