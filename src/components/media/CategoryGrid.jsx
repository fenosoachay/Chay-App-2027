import React, { useState } from "react";
import { CATEGORIES } from "@/lib/mediaConstants";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { CLE_SECTIONS, appliquerOrdre } from "@/lib/ordreMedia";
import { enregistrerOrdreMedia, useOrdreMedia } from "@/hooks/useOrdreMedia";
import CadenasOrdre from "@/components/media/CadenasOrdre";
import ListeTriable from "@/components/media/ListeTriable";

/** Sections du multimédia dans l'ordre choisi par l'admin (nouvelles sections à la fin). */
export function useSectionsOrdonnees() {
  const ids = useOrdreMedia(CLE_SECTIONS);
  return appliquerOrdre(CATEGORIES, ids, { nouveauxEnTete: false });
}

export default function CategoryGrid({ onOpen, radioPlaying, onToggleRadio }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const sections = useSectionsOrdonnees();
  const [verrouille, setVerrouille] = useState(true);

  const reordonner = (next) => {
    enregistrerOrdreMedia(CLE_SECTIONS, next.map((c) => c.id))
      .catch((e) => toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" }));
  };

  // Admin, cadenas ouvert : sections en liste, glisser-déposer au doigt (même mécanisme que YouTube).
  if (isAdmin && !verrouille) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">Glissez les sections pour changer leur ordre (vu par tous les membres).</p>
          <CadenasOrdre verrouille={false} onBascule={() => setVerrouille(true)} libelle="les sections" />
        </div>
        <ListeTriable
          id="sections-multimedia"
          items={sections}
          onReorder={reordonner}
          renderRow={(c) => (
            <>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${c.tone} text-white`}>
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{c.label}</span>
            </>
          )}
        />
      </div>
    );
  }

  return (
    <div>
    {isAdmin && (
      <div className="mb-3 flex justify-end">
        <CadenasOrdre verrouille onBascule={() => setVerrouille(false)} libelle="les sections" />
      </div>
    )}
    <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-4 md:gap-6">
      {/* « Votre Playlist » est visible pour TOUS les utilisateurs, admins inclus. */}
      {sections.map((c) => {
        const Icon = c.icon;
        const isRadio = c.id === "radio";
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="group flex flex-col items-center gap-2"
          >
            <span
              className={`relative aspect-square w-full rounded-[1.5rem] bg-gradient-to-br ${c.tone} grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-lg transition-all`}
            >
              <Icon className="h-9 w-9 md:h-10 md:w-10" />
              {isRadio && radioPlaying && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
                </span>
              )}
            </span>
            {/* whitespace-nowrap : « Prédications » ne doit JAMAIS casser au
                milieu du mot (le « s » seul sur une 2e ligne) — même avec une
                grande taille de texte réglée dans l'app. */}
            <span className="max-w-full text-[0.9375rem] md:text-[1.3125rem] font-semibold text-foreground/70 text-center leading-tight whitespace-normal">
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
    </div>
  );
}