import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLectureMinimale } from "@/hooks/useCompteurVues";
import { useToast } from "@/components/ui/use-toast";
import TexteRiche from "./TexteRiche";


function Body({ body }) {
  if (!body) return null;
  return <TexteRiche html={body} />;
}

export default function ParolesCard({ texte }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const open = searchParams.get("parole") === texte.id;
  const [loading, setLoading] = useState(false);

  const setOpen = (v) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("parole", texte.id);
    else next.delete("parole");
    setSearchParams(next, { replace: !v });
  };

  // Compteur de vues : +1 après 2 minutes de lecture
  const vue = { type: "parole", id: texte.id };
  useLectureMinimale(vue, open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        aria-label={`Lire : ${texte.title || "sans titre"}`}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h3 className="w-full break-words font-display font-bold text-base leading-snug text-foreground">
          {texte.title || "Sans titre"}
        </h3>
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