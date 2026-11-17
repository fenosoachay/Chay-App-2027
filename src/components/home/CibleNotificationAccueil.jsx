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
import FullImage from "@/components/ui/FullImage";
import ContentDetailDialog from "./ContentDetailDialog";
import { cibleAccueil, libelleAnnonce } from "@/lib/cibleAccueil";

const dateFr = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

// Écran précis d'une notification sur l'accueil : verset du jour (?verset=), annonce ou réunion (?annonce=),
// autre contenu publié (?contenu=). Chargé par son id : fonctionne même si les sections ne sont pas chargées.
export default function CibleNotificationAccueil() {
  const [searchParams, setSearchParams] = useSearchParams();
  const cible = cibleAccueil(searchParams);
  const [fiche, setFiche] = useState(null);
  const [introuvable, setIntrouvable] = useState(false);

  useEffect(() => {
    setFiche(null);
    setIntrouvable(false);
    if (!cible) return undefined;
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

  // Verset du jour (daily_verse) : affichage limité à une fois par jour par appareil.
  // L'adresse ?verset= vient de la notification et l'app y revient à chaque réouverture.
  useEffect(() => {
    if (cible?.collection === "Devotional" && searchParams.has("verset")) {
      const auj = new Date().toLocaleDateString("en-CA"); // AAAA-MM-JJ local
      const dernier = localStorage.getItem("chay_dernier_verset_date");
      if (dernier === auj) {
        fermer();
      } else {
        localStorage.setItem("chay_dernier_verset_date", auj);
      }
    }
  }, [cible, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cible) return null;
  if (cible.collection === "Content" && fiche) {
    return <ContentDetailDialog item={fiche} open onOpenChange={(v) => !v && fermer()} />;
  }

  let titre = "Chargement…";
  let sousTitre = "";
  let corps = null;
  if (introuvable) {
    titre = "Contenu introuvable";
    corps = <p className="text-sm text-foreground/60">Ce contenu n'est plus disponible.</p>;
  } else if (fiche && cible.collection === "Devotional") {
    titre = fiche.scripture_reference || fiche.title || "Verset du jour";
    sousTitre = `Verset du jour${fiche.reading_date ? ` · ${dateFr(fiche.reading_date)}` : ""}`;
    corps = (
      <>
        <FullImage src={fiche.image_url} className="rounded-xl mb-2 bg-muted/40" />
        {fiche.verse_text && <blockquote className="border-l-4 border-primary pl-3 italic">{fiche.verse_text}</blockquote>}
        {fiche.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none mt-3">
            <ReactMarkdown>{fiche.content}</ReactMarkdown>
          </div>
        )}
      </>
    );
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
