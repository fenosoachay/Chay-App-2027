import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import FullImage from "@/components/ui/FullImage";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import CompteurVues from "@/components/media/CompteurVues";
import { useLectureMinimale } from "@/hooks/useCompteurVues";


// Le corps d'article existe sous deux formes :
//  - HTML, produit par l'éditeur riche de l'app Multimédia (ReactQuill)
//  - texte/Markdown, saisi dans le champ « Contenu » de l'admin
// On détecte le HTML pour ne jamais afficher des balises brutes.
const looksLikeHtml = (s) => /<[a-z][^>]*>/i.test(s || "");

function ArticleBody({ body }) {
  if (!body) return null;

  if (looksLikeHtml(body)) {
    return (
    <div
className="article-body"
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
/>

    );
  }
  return (
    <div className="article-body">
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ArticleCard({ article }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Lien ou notification vers cet article (?article=<id>) : il s'ouvre tout seul.
  const cible = searchParams.get("article") === article.id;
  // 1.3.15 : un clic ouvre l'article SANS changer l'adresse. Avant, l'ajout de ?article= relançait le chargement
  // de la cible (Media.jsx), recalculait la playlist ouverte (NavigationPlaylists) et ajoutait une entrée
  // d'historique en plus de celle de la fenêtre : dans une playlist, l'article se refermait au bout d'une seconde.
  // Le bouton retour ferme toujours l'article (entrée d'historique de la fenêtre, useBackHandler).
  const [open, setOuvert] = useState(cible);
  useEffect(() => {
    if (cible) setOuvert(true);
  }, [cible]);

  const setOpen = (v) => {
    setOuvert(v);
    // Fermeture d'un article ouvert par un lien : on retire ?article= (remplacement, sans entrée fantôme).
    // On part des paramètres DÉJÀ présents pour garder ?cat=articles.
    if (!v && searchParams.get("article") === article.id) {
      const next = new URLSearchParams(searchParams);
      next.delete("article");
      setSearchParams(next, { replace: true });
    }
  };

  const date = formatDate(article.created_date);
  // Compteur de vues : +1 après 2 minutes de lecture de l'article ouvert.
  const vue = { type: "article", id: article.id };
  useLectureMinimale(vue, open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lire l'article : ${article.title || "sans titre"}`}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h3 className="w-full break-words font-display font-bold text-base leading-snug text-foreground">
          {article.title || "Sans titre"}
        </h3>
        <span className="flex flex-wrap items-center gap-x-3">
          {date && <span className="text-xs text-foreground/50">{date}</span>}
          <CompteurVues vue={vue} base={article.view_count} />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto sm:rounded-3xl">
          <div className="pr-7">
            {article.cover_url ? (
              // Image entière (recadrée à l'envoi ou non) : jamais recoupée à l'affichage.
              <FullImage src={article.cover_url} className="rounded-2xl mb-5 bg-muted/40" />
            ) : (
              <div className="w-full h-32 rounded-2xl brand-gradient mb-5" />
            )}

            <DialogHeader className="gap-0">
              {article.category && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-primary">
                  {article.category}
                </span>
              )}
              <DialogTitle className="font-display text-2xl md:text-3xl font-extrabold leading-[1.15] tracking-normal text-foreground">
                {article.title}
              </DialogTitle>
              {(article.author || date) && (
                <DialogDescription className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/55">
                  {article.author && (
                    <span className="font-semibold text-foreground/75">
                      Par {article.author}
                    </span>
                  )}
                  {article.author && date && (
                    <span aria-hidden="true" className="text-foreground/30">·</span>
                  )}
                  {date && <span>{date}</span>}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="my-5 h-px bg-border" />

            <ArticleBody body={article.body} />

            {!article.body && (
              <p className="text-sm text-foreground/50 italic">
                Cet article ne contient pas encore de contenu.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
