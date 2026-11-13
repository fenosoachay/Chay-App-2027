import React, { useState } from "react";
import CadenasOrdre from "@/components/media/CadenasOrdre";
import ListeTriable from "@/components/media/ListeTriable";

// Liste de contenus que l'admin peut réordonner (1.3.9) : cadenas fermé = affichage habituel (`children`) ;
// cadenas ouvert = liste à glisser au doigt (ListeTriable, même mécanisme que YouTube), chaque déplacement est
// enregistré tout de suite par `onReorder(liste)` et vu par les membres. Membres : affichage habituel seulement.
export default function BlocOrdonnable({ id, isAdmin, items, onReorder, libelle, vignette, titre, children, entete = null }) {
  const [verrouille, setVerrouille] = useState(true);
  const peutTrier = isAdmin && Array.isArray(items) && items.length > 1;
  return (
    <div>
      {(entete || peutTrier) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{entete}</div>
          {peutTrier && <CadenasOrdre verrouille={verrouille} onBascule={() => setVerrouille((v) => !v)} libelle={libelle} />}
        </div>
      )}
      {peutTrier && !verrouille ? (
        <>
          <p className="mb-2 text-xs font-semibold text-primary">Glissez pour changer l'ordre (vu par tous les membres).</p>
          <ListeTriable
            id={id}
            items={items}
            onReorder={onReorder}
            renderRow={(x) => (
              <>
                {vignette?.(x) ? (
                  <img src={vignette(x)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover bg-muted" />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{titre?.(x) || "Sans titre"}</span>
              </>
            )}
          />
        </>
      ) : (
        children
      )}
    </div>
  );
}
