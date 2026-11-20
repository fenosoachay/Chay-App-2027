import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const cible = cibleAccueil(searchParams);
  const [fiche, setFiche] = useState(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    setFiche(null);
    setIntrouvable(false);
    if (!cible || cible.collection === "Devotional") return undefined;
    let actif = true;
    base44.entities[cible.collection]
      .get(cible.id)
      .then((r) => { if (actif) setFiche(r || null); if (actif && !r) setIntrouvable(true); })
      .catch(() => { if (actif) setIntrouvable(true); });
    return () => { actif = false; };
  }, [cible?.collection, cible?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fermer = () => {
    const next = new URLSearchParams(searchParams);
    ["verset", "annonce", "contenu"].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  // Verset du jour (notification ?verset=) : plus de fenêtre, l'accueil s'affiche simplement (le verset du jour
  // est déjà sur l'accueil). L'adresse est nettoyée.
  const estVerset = cible?.collection === "Devotional";
  useEffect(() => {
    if (estVerset) fermer();
  }, [estVerset]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cible || estVerset) return null;
  if (cible.collection === "Content" && fiche) {
    return <ContentDetailDialog item={fiche} open onOpenChange={(v) => !v && fermer()} />;
  }

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
