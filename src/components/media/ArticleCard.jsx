import React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Image } from "@/components/ui/image";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";


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
  const open = searchParams.get("article") === article.id;

  // IMPORTANT : on part des paramètres DÉJÀ présents (?cat=articles) avant
  // d'ajouter `article`. Avec setSearchParams({ article }), React Router
  // remplace toute la chaîne de requête : `cat` disparaît, Media.jsx perd son
  // activeCat et la page retombe sur la grille de catégories au lieu
  // d'ouvrir l'article.
  const setOpen = (v) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("article", article.id);
    else next.delete("article");
    // Ouverture = nouvelle entrée d'historique (le retour ferme l'article) ;
    // fermeture = remplacement (pas d'entrée fantôme dans l'historique).
    setSearchParams(next, { replace: !v });
  };

  const date = formatDate(article.created_date);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lire l'article : ${article.title || "sans titre"}`}
        className="text-left rounded-[1.5rem] border border-border bg-card overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {article.cover_url ? (
          article.cover_cropped ? (
            // Image explicitement rognée par l'utilisateur : on reprend le
            // cadrage 16:9 enregistré au moment du crop (comportement actuel).
            <div className="h-40 overflow-hidden">
              <Image src={article.cover_url} fittingType="fill" className="w-full h-full" />
            </div>
          ) : (
            // Image non recadrée : taille originale, sans déformation, qui
            // remplit tout le fond de la carte.
            <div className="relative w-full min-h-40 overflow-hidden">
              <img
                src={article.cover_url}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          )
        ) : (
          <div className="h-40 brand-gradient" />
        )}
        <div className="p-5">
          {article.category && (
            <span className="text-xs font-bold text-primary uppercase tracking-wide">
              {article.category}
            </span>
          )}
          <h3 className="font-display font-bold text-lg leading-snug line-clamp-2 mt-1">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="text-sm text-foreground/55 mt-2 line-clamp-3">{article.excerpt}</p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-foreground/40">
            {article.author && <span>Par {article.author}</span>}
            {article.author && date && <span aria-hidden="true">·</span>}
            {date && <span>{date}</span>}
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
            Lire l'article
            <span aria-hidden="true">→</span>
          </span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto sm:rounded-3xl">
          <div className="pr-7">
            {article.cover_url ? (
              article.cover_cropped ? (
                <Image
                  src={article.cover_url}
                  fittingType="fill"
                  className="w-full h-44 md:h-56 rounded-2xl object-cover mb-5"
                />
              ) : (
                // Non recadrée : image originale qui remplit tout le fond, sans déformation.
                <div className="relative w-full min-h-44 md:min-h-56 rounded-2xl overflow-hidden mb-5">
                  <img
                    src={article.cover_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              )
            ) : (
              <div className="w-full h-32 rounded-2xl brand-gradient mb-5" />
            )}

            <DialogHeader className="gap-0">
              {article.category && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
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
