import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLectureMinimale } from "@/hooks/useCompteurVues";
import CompteurVues from "@/components/media/CompteurVues";
import { ChevronRight, Music } from "lucide-react";
import TexteRiche from "./TexteRiche";


function Body({ body }) {
  if (!body) return null;
  return <TexteRiche html={body} />;
}

// `variante="ligne"` : ligne de liste (icône, titre, flèche), utilisée dans la section Paroles groupée par lettre.
export default function ParolesCard({ texte, variante = "carte" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Ouverture gardée ici (et non dans l'adresse) : changer l'adresse rechargeait la page Multimédia, et la
  // fenêtre des paroles s'ouvrait puis se refermait aussitôt (clignotement). Un lien ?parole= (ancien partage)
  // ouvre encore la fenêtre une fois, puis l'adresse est nettoyée.
  const [open, setOpenLocal] = useState(() => searchParams.get("parole") === texte.id);
  const [loading] = useState(false);

  const setOpen = (v) => {
    setOpenLocal(Boolean(v));
    if (!v && searchParams.get("parole")) {
      const next = new URLSearchParams(searchParams);
      next.delete("parole");
      setSearchParams(next, { replace: true });
    }
  };

  // Compteur de vues : +1 après 10 secondes de lecture (paroles ouvertes)
  const vue = { type: "parole", id: texte.id };
  useLectureMinimale(vue, open, 10000);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        aria-label={`Lire : ${texte.title || "sans titre"}`}
        className={variante === "ligne"
          ? "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          : "flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}
      >
        {variante === "ligne" && <Music className="h-5 w-5 shrink-0 text-foreground/70" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <h3 className="break-words font-display font-bold text-base leading-snug text-foreground">
            {texte.title || "Sans titre"}
          </h3>
          <CompteurVues vue={vue} base={texte.view_count} />
        </span>
        {variante === "ligne" && <ChevronRight className="h-5 w-5 shrink-0 text-foreground/50" aria-hidden="true" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto sm:rounded-3xl">
          <div className="pr-7">
            <DialogHeader className="gap-0">
              <DialogTitle className="font-display text-2xl md:text-3xl font-extrabold leading-[1.15] tracking-normal text-foreground">
                {texte.title}
              </DialogTitle>
            </DialogHeader>

            <div className="my-5 h-px bg-border" />

            <Body body={texte.body} />

            {!texte.body && (
              <p className="text-sm text-foreground/50 italic">Ce texte ne contient pas encore de contenu.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}