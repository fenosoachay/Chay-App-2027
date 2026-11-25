import React, { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { JEUX_ADULTES, JEUX_ENFANTS, PERIODES, rangTexte } from "@/lib/scoreBoard";

// Score Board (1.3.22) : en haut de Chay Enfants (espace « enfant », par pseudo) et des Jeux (espace « adulte »).
// Onglets Semaine / Mois / Toujours, classement général et par jeu, 5 premiers + sa propre place.
const MEDAILLES = ["🥇", "🥈", "🥉"];

/** « 1er décembre » : début du mois prochain, quand le classement du mois repart à zéro. */
function prochainMois(maintenant = new Date()) {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  return `1er ${d.toLocaleDateString("fr-FR", { month: "long" })}`;
}

function Initiales({ nom }) {
  const t = String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();
  return <span className="grid h-full w-full place-items-center bg-primary/15 text-xs font-bold text-primary">{t || "?"}</span>;
}

export default function ScoreBoard({ espace = "adulte", pseudo = "", titre }) {
  const jeux = espace === "enfant" ? JEUX_ENFANTS : JEUX_ADULTES;
  // 1.3.28 : le classement du mois d'abord (il repart à zéro le 1er, annoncé en haut) ; « Toujours » garde
  // tous les points, y compris ceux d'avant le Score Board.
  const [periode, setPeriode] = useState("mois");
  const [jeu, setJeu] = useState("general");
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let actif = true;
    setData(null);
    setErreur(false);
    base44.functions
      .invoke("classement", { espace, jeu, periode, pseudo })
      .then((r) => { if (actif) setData(Array.isArray(r?.data?.top) ? r.data : { top: [], moi: null }); })
      .catch(() => { if (actif) { setErreur(true); setData({ top: [], moi: null }); } });
    return () => { actif = false; };
  }, [espace, jeu, periode, pseudo]);

  const enfant = espace === "enfant";
  const unSeulJeu = jeux.length <= 2; // « Général » + un seul jeu : pas de choix de jeu
  const nomPeriode = periode === "semaine" ? "cette semaine" : periode === "mois" ? "ce mois-ci" : "pour l'instant";

  return (
    <section className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm md:p-5" aria-label="Classement">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#F2C94C] to-[#B8860B] text-white shadow">
          <Trophy className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <h2 className="font-display text-xl font-extrabold leading-tight">{titre || (enfant ? "Score Board" : "Leaderboard")}</h2>
          <p className="text-xs text-foreground/50">Remis à zéro le {prochainMois()}</p>
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {PERIODES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriode(p.id)}
            className={`rounded-full py-1.5 text-sm font-bold transition ${periode === p.id ? "bg-background shadow text-foreground" : "text-foreground/60"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!unSeulJeu && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {jeux.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setJeu(j.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition ${jeu === j.id ? "bg-primary text-primary-foreground" : "border border-border text-foreground/70"}`}
            >
              {j.label}
            </button>
          ))}
        </div>
      )}

      {data === null ? (
        <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : data.top.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/60">
          {erreur ? "Classement indisponible pour le moment." : `Personne n'a encore marqué de points ${nomPeriode}. Sois le premier !`}
        </p>
      ) : (
        <ol className="space-y-1.5">
          {data.top.map((l) => (
            <li
              key={`${l.rang}-${l.nom}-${l.user_id || l.avatar}`}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${l.moi ? "bg-primary/15 ring-1 ring-primary/40" : "bg-muted/50"}`}
            >
              <span className="w-7 shrink-0 text-center text-lg font-black tabular-nums">
                {l.rang <= 3 ? MEDAILLES[l.rang - 1] : l.rang}
              </span>
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-background">
                {enfant ? (
                  <span className="grid h-full w-full place-items-center text-xl" aria-hidden="true">{l.avatar}</span>
                ) : l.photo ? (
                  <img src={l.photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Initiales nom={l.nom} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{l.nom}{l.moi ? " (toi)" : ""}</span>
              <span className="shrink-0 font-black tabular-nums text-primary">{l.points} pts</span>
            </li>
          ))}
        </ol>
      )}

      {data && data.moi && !data.moi.dansTop && (
        <p className="mt-3 rounded-2xl bg-primary/10 px-3 py-2 text-center text-sm font-semibold">
          Ta place : <b>{rangTexte(data.moi.rang)}</b> · {data.moi.points} pts
        </p>
      )}
      {data && !data.moi && data.top.length > 0 && (
        <p className="mt-3 text-center text-xs text-foreground/50">Joue pour entrer au classement !</p>
      )}
    </section>
  );
}
