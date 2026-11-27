import React, { useEffect, useState } from "react";
import { Cast, Loader2, RefreshCw, Tv, X } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import { toast } from "@/components/ui/use-toast";
import { chercherTv, envoyerSurTv, messageTv, tvDisponible } from "@/lib/tv";

// Bouton « Diffuser sur la TV » des lecteurs (vidéo, musique, prédication, radio) — application Android seulement.
// media() : { url, titre, video, position, direct } au moment du choix de la TV ; onAvantEnvoi : arrêter la lecture
// sur le téléphone (le téléphone devient la télécommande).
function ChoixTv({ onFermer, onChoisir }) {
  const [appareils, setAppareils] = useState(null);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState("");
  useBackHandler(true, onFermer);

  const chercher = async () => {
    setAppareils(null);
    setErreur("");
    try {
      setAppareils(await chercherTv());
    } catch (e) {
      setErreur(messageTv(e, "Recherche impossible. Vérifiez le Wi-Fi."));
      setAppareils([]);
    }
  };
  useEffect(() => { chercher(); }, []);

  const choisir = async (a) => {
    setEnvoi(a.id);
    try {
      await onChoisir(a);
      onFermer();
    } catch (e) {
      toast({ title: "Diffusion impossible", description: messageTv(e, "La TV n'a pas pu lire ce média."), variant: "destructive" });
    } finally {
      setEnvoi("");
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 sm:items-center" onClick={onFermer}>
      <div
        className="w-full max-w-md rounded-t-[1.75rem] bg-background p-5 text-foreground shadow-2xl sm:rounded-[1.75rem]"
        style={{ paddingBottom: "max(1.25rem, var(--sa-bottom))" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Diffuser sur une TV"
      >
        <div className="mb-3 flex items-center gap-2">
          <Cast className="h-5 w-5 text-primary" />
          <p className="flex-1 font-display text-lg font-extrabold">Diffuser sur une TV</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {appareils === null ? (
          <div className="flex items-center gap-3 py-6 text-sm text-foreground/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Recherche des TV sur le Wi-Fi…
          </div>
        ) : appareils.length === 0 ? (
          <div className="space-y-2 py-3 text-sm text-foreground/70">
            <p className="font-semibold text-foreground">{erreur || "Aucune TV trouvée."}</p>
            <p>Le téléphone et la TV doivent être sur le <b>même Wi-Fi</b>, et la TV allumée.</p>
            <p>Sur la TV, activez le <b>partage de contenu</b> (« Partage de contenu », « DLNA » ou « Content Sharing » dans les paramètres).</p>
            <p>Sony : <b>Réseau › Configuration réseau domestique › Fonction de rendu</b>. Google TV, Android TV et Chromecast sont trouvés directement.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {appareils.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => choisir(a)}
                  disabled={Boolean(envoi)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary disabled:opacity-60"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    {envoi === a.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Tv className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{a.nom}</span>
                    {a.modele && <span className="block truncate text-xs text-foreground/50">{a.modele}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={chercher}
          disabled={appareils === null || Boolean(envoi)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Rechercher à nouveau
        </button>
      </div>
    </div>
  );
}

export default function BoutonTv({ media, onAvantEnvoi, className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  if (!tvDisponible()) return null;

  const envoyer = async (appareil) => {
    const m = media();
    if (!m?.url) throw new Error("Ce média ne peut pas être envoyé sur la TV.");
    await envoyerSurTv(appareil, m);
    try { onAvantEnvoi?.(); } catch { /* lecture déjà arrêtée */ }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Diffuser sur la TV"
        title="Diffuser sur la TV"
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      >
        <Cast className="h-5 w-5" />
      </button>
      {ouvert && <ChoixTv onFermer={() => setOuvert(false)} onChoisir={envoyer} />}
    </>
  );
}
