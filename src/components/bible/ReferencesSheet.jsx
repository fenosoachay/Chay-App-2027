import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Link2, Loader2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getLocalChapterVerses } from "@/lib/localBible";
import {
  SOURCE_REFERENCES, chargerLivre, libelleReference, referencesDeVersets, textePassage,
} from "@/lib/referencesCroisees";

const PAR_PAGE = 20;

// Références croisées (1.3.26) : tous les passages liés aux versets sélectionnés dans le lecteur, du plus au
// moins pertinent, avec leur texte dans la Bible lue (Louis Segond ou Baiboly). Toucher un passage l'ouvre.
export default function ReferencesSheet({ open, onOpenChange, lang, books, livre, chapitre, versets, onOuvrir }) {
  const [refs, setRefs] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [textes, setTextes] = useState(() => new Map());
  const [nombre, setNombre] = useState(PAR_PAGE);
  const cleVersets = (versets || []).join(",");

  const nomLivre = useMemo(() => {
    const noms = new Map((books || []).map((b) => [b.order, b.name]));
    return (rang) => noms.get(rang) || `Livre ${rang}`;
  }, [books]);

  useEffect(() => {
    if (!open || !livre) return undefined;
    let vivant = true;
    setRefs(null);
    setErreur(false);
    setNombre(PAR_PAGE);
    chargerLivre(livre.order)
      .then((d) => { if (vivant) setRefs(referencesDeVersets(d, livre.order, chapitre, versets)); })
      .catch(() => { if (vivant) { setErreur(true); setRefs([]); } });
    return () => { vivant = false; };
  }, [open, livre, chapitre, cleVersets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Texte des passages affichés (le fichier de la Bible est déjà en mémoire : rapide, sans réseau).
  useEffect(() => {
    if (!refs?.length) return undefined;
    let vivant = true;
    const visibles = refs.slice(0, nombre);
    (async () => {
      const suivants = new Map();
      for (const r of visibles) {
        const b = (books || []).find((x) => x.order === r.b);
        if (!b) continue;
        const versetsChapitre = await getLocalChapterVerses(lang, b.id, r.c).catch(() => []);
        suivants.set(`${r.b}.${r.c}.${r.v}.${r.v2}`, textePassage(versetsChapitre, r));
      }
      if (vivant) setTextes(suivants);
    })();
    return () => { vivant = false; };
  }, [refs, nombre, lang, books]);

  const titre = livre
    ? `${livre.name} ${chapitre}:${versets.length > 1 ? `${versets[0]}-${versets[versets.length - 1]}` : versets[0]}`
    : "";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader className="shrink-0 text-left">
          <DrawerTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Références croisées
          </DrawerTitle>
          <DrawerDescription className="font-semibold text-foreground/70">
            {titre}{refs?.length ? ` · ${refs.length} passage${refs.length > 1 ? "s" : ""}` : ""}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {refs === null ? (
            <div className="grid h-32 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : erreur ? (
            <p className="py-8 text-center text-sm text-foreground/60">Références indisponibles pour le moment.</p>
          ) : refs.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground/60">Aucune référence croisée pour ce verset.</p>
          ) : (
            <ul className="space-y-2">
              {refs.slice(0, nombre).map((r) => {
                const cle = `${r.b}.${r.c}.${r.v}.${r.v2}`;
                const texte = textes.get(cle);
                return (
                  <li key={`${cle}-${r.b2}.${r.c2}`}>
                    <button
                      type="button"
                      onClick={() => onOuvrir(r)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-base font-extrabold text-primary">{libelleReference(r, nomLivre)}</span>
                        {texte === undefined ? (
                          <span className="mt-1 block h-4 w-2/3 animate-pulse rounded bg-muted" />
                        ) : texte ? (
                          <span className="mt-0.5 block text-sm leading-relaxed text-foreground/80">{texte}</span>
                        ) : (
                          <span className="mt-0.5 block text-xs italic text-foreground/50">Texte non disponible dans cette Bible (numérotation différente).</span>
                        )}
                      </span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-foreground/40" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {refs && refs.length > nombre && (
            <button
              type="button"
              onClick={() => setNombre((n) => n + PAR_PAGE)}
              className="mt-3 w-full rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted"
            >
              Voir plus ({refs.length - nombre})
            </button>
          )}
          <p className="mt-4 text-center text-[0.7rem] text-foreground/40">Source : {SOURCE_REFERENCES}</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
