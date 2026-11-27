import React, { useState } from "react";
import { CATEGORIES } from "@/lib/mediaConstants";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { CLE_SECTIONS, appliquerOrdre } from "@/lib/ordreMedia";
import { enregistrerOrdreMedia, useOrdreMedia } from "@/hooks/useOrdreMedia";
import CadenasOrdre from "@/components/media/CadenasOrdre";
import ListeTriable from "@/components/media/ListeTriable";
import { enregistrerLibelle, useLibellesMedia } from "@/hooks/useLibellesMedia";

/** Sections du multimédia dans l'ordre et avec les noms choisis par l'admin (nouvelles sections à la fin). */
export function useSectionsOrdonnees() {
  const ids = useOrdreMedia(CLE_SECTIONS);
  const libelles = useLibellesMedia();
  return appliquerOrdre(CATEGORIES, ids, { nouveauxEnTete: false })
    .map((c) => (libelles[c.id] ? { ...c, label: libelles[c.id], labelOrigine: c.label } : c));
}

/** Champ du nom d'une section (admin) : enregistré quand on quitte le champ ou appuie sur Entrée. */
function NomSection({ section, onErreur }) {
  const [valeur, setValeur] = useState(section.label);
  const enregistrer = () => {
    const v = valeur.trim();
    if (v === section.label) return;
    // Nom remis à celui d'origine (ou vidé) : on efface le nom personnalisé.
    const origine = section.labelOrigine || section.label;
    enregistrerLibelle(section.id, !v || v === origine ? "" : v).catch(onErreur);
    if (!v) setValeur(origine);
  };
  return (
    <input
      value={valeur}
      maxLength={40}
      onChange={(e) => setValeur(e.target.value)}
      onBlur={enregistrer}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Nom de la section ${section.labelOrigine || section.label}`}
      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 font-bold"
    />
  );
}

export default function CategoryGrid({ onOpen, radioPlaying, onToggleRadio: _onToggleRadio }) {
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
          <p className="text-sm font-semibold text-primary">Glissez les sections pour changer leur ordre, et touchez un nom pour le modifier (vu par tous les membres).</p>
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
              <NomSection section={c} onErreur={(e) => toast({ title: "Nom non enregistré", description: e.message, variant: "destructive" })} />
            </>
          )}
        />
      </div>
    );
  }

  // Designs variés pour les cartes de catégorie
  const designs = [
    // Design 1: Dégradé classique avec icône (défaut)
    {
      name: "classic",
      render: (c, Icon, isRadio, radioPlaying) => (
        <span className={`relative aspect-square w-full rounded-[1.5rem] bg-gradient-to-br ${c.tone} grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-300`}>
          <Icon className="h-9 w-9 md:h-10 md:w-10 drop-shadow-lg" />
          {isRadio && radioPlaying && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
            </span>
          )}
        </span>
      )
    },
    // Design 2: Carte en verre (glassmorphism) avec bordure colorée
    {
      name: "glass",
      render: (c, Icon, isRadio, radioPlaying) => (
        <div className="relative aspect-square w-full rounded-[1.5rem] bg-white/10 dark:bg-black/20 backdrop-blur-xl border grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-300 overflow-hidden"
             style={{ borderColor: c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2" }}>
          <div className="absolute inset-0 bg-gradient-to-br" style={{ opacity: 0.15, background: c.tone }} />
          <Icon className="relative h-9 w-9 md:h-10 md:w-10 drop-shadow-lg" />
          {isRadio && radioPlaying && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
            </span>
          )}
        </div>
      )
    },
    // Design 3: Style néon avec lueur
    {
      name: "neon",
      render: (c, Icon, isRadio, radioPlaying) => (
        <span className={`relative aspect-square w-full rounded-[1.5rem] grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-300`}
              style={{
                background: c.tone,
                boxShadow: `0 0 30px ${c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2"}`
              }}>
          <Icon className="h-9 w-9 md:h-10 md:w-10 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          {isRadio && radioPlaying && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
            </span>
          )}
          <div className="absolute inset-0 rounded-[1.5rem] opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `inset 0 0 60px ${c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2"}` }} />
        </span>
      )
    },
    // Design 4: Style matériel avec profondeur
    {
      name: "material",
      render: (c, Icon, isRadio, radioPlaying) => (
        <div className="relative aspect-square w-full rounded-[1.5rem] grid place-items-center text-white shadow-lg group-hover:-translate-y-1 group-hover:shadow-2xl transition-all duration-300 transform-gpu"
             style={{
               background: c.tone,
               boxShadow: `0 8px 32px -8px ${c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2"}`
             }}>
          <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-b from-white/20 to-transparent" />
          <div className="absolute inset-0 rounded-[1.5rem] bg-gradient-to-t from-black/20 to-transparent" />
          <Icon className="relative h-9 w-9 md:h-10 md:w-10 drop-shadow-xl" />
          {isRadio && radioPlaying && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
            </span>
          )}
        </div>
      )
    },
    // Design 5: Style minimaliste avec accent
    {
      name: "minimal",
      render: (c, Icon, isRadio, radioPlaying) => (
        <div className="relative aspect-square w-full rounded-[1.5rem] grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-lg transition-all duration-300 overflow-hidden"
             style={{ background: c.tone }}>
          <div className="absolute inset-0" style={{
            background: `linear-gradient(135deg, ${c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2"} 0%, transparent 50%)`,
            opacity: 0.3
          }} />
          <div className="absolute bottom-0 left-0 right-0 h-2" style={{ background: `linear-gradient(90deg, transparent, ${c.tone.split(" ")[1] || c.tone.split("to-")[1]?.trim() || "#8A56E2"}, transparent)` }} />
          <Icon className="relative h-9 w-9 md:h-10 md:w-10 drop-shadow-lg" />
          {isRadio && radioPlaying && (
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2 py-0.5 text-[0.6rem] font-bold uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> En direct
            </span>
          )}
        </div>
      )
    }
  ];

  // Par défaut, utiliser le design "classic" (index 0)
  const activeDesign = designs[0];

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
            {activeDesign.render(c, Icon, isRadio, radioPlaying)}
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