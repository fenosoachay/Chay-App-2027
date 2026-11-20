import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import ContentDetailDialog from "./ContentDetailDialog";
import { cibleAccueil, libelleAnnonce } from "@/lib/cibleAccueil";
import { routeContenu } from "@/lib/routesNotification";

const dateFr = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

// Écran précis d'une notification sur l'accueil : annonce ou réunion (?annonce=),
// autre contenu publié (?contenu=). Chargé par son id. Verset du jour (?verset=) : accueil seul, sans fenêtre.
export default function CibleNotificationAccueil() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const cibleAdresse = cibleAccueil(searchParams);
  // La cible est gardée ici et l'adresse est nettoyée TOUT DE SUITE : avant, la fenêtre se refermait puis
  // revenait à chaque retour sur l'accueil (le retour retombait sur l'adresse « ?contenu= »).
  const [cible, setCible] = useState(null);
  const [fiche, setFiche] = useState(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    if (!cibleAdresse) return;
    // Verset du jour : l'accueil seul (le verset est déjà sur l'accueil), sans fenêtre.
    if (cibleAdresse.collection !== "Devotional") setCible(cibleAdresse);
    const next = new URLSearchParams(searchParams);
    ["verset", "annonce", "contenu"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [cibleAdresse?.collection, cibleAdresse?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFiche(null);
    setIntrouvable(false);
    if (!cible) return undefined;
    let actif = true;
    base44.entities[cible.collection]
      .get(cible.id)
      .then((r) => {
        if (!actif) return;
        if (!r) { setIntrouvable(true); return; }
        // Contenu publié (paroles, verset, chanson, vidéo, article…) : on va directement sur le contenu.
        if (cible.collection === "Content") {
          const route = routeContenu(r);
          if (route && !route.startsWith("/?contenu=")) {
            setCible(null);
            navigate(route);
            return;
          }
        }
        setFiche(r);
      })
      .catch(() => { if (actif) setIntrouvable(true); });
    return () => { actif = false; };
  }, [cible?.collection, cible?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fermer = () => setCible(null);

  if (!cible) return null;
  if (cible.collection === "Content" && fiche) {
    return <ContentDetailDialog item={fiche} open onOpenChange={(v) => !v && fermer()} />;
  }
  if (cible.collection === "Content" && !introuvable) return null; // en route vers le contenu

  let titre = "Chargement…";
  let sousTitre = "";
  let corps = null;
  if (introuvable) {
    titre = "Contenu introuvable";
    corps = <p className="text-sm text-foreground/60">Ce contenu n'est plus disponible.</p>;
  } else if (fiche && cible.collection === "Announcement") {
    titre = fiche.title || libelleAnnonce(fiche);
    const quand = dateFr(fiche.event_date || fiche.date);
    sousTitre = `${libelleAnnonce(fiche)}${quand ? ` · ${quand}` : ""}`;
    corps = fiche.body ? (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{fiche.body}</ReactMarkdown>
      </div>
    ) : null;
  }

  return (
    <Dialog open onOpenChange={(v) => !v && fermer()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{titre}</DialogTitle>
          {sousTitre ? <DialogDescription>{sousTitre}</DialogDescription> : null}
        </DialogHeader>
        {corps}
      </DialogContent>
    </Dialog>
  );
}
