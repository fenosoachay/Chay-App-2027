import { useRef, useState } from "react";
import { deplacer, ordreChange, positionCible } from "@/lib/glisserOrdre";

// Glisser pour réordonner, souris ET tactile (Android WebView) via les événements pointeur :
// - la poignée a `touch-action: none` et capture le pointeur : le défilement ne vole pas le geste ;
// - l'élément suit le doigt (aperçu en direct) et la page défile près des bords ;
// - au lâcher (ou si Android annule le geste), le nouvel ordre est transmis à onReorder.
const BORD_PX = 90;
const PAS_DEFILEMENT_PX = 14;

function defilerAuBord(y) {
  if (typeof window === "undefined") return;
  if (y < BORD_PX) window.scrollBy(0, -PAS_DEFILEMENT_PX);
  else if (y > window.innerHeight - BORD_PX) window.scrollBy(0, PAS_DEFILEMENT_PX);
}

export function useDragSort(items, onReorder) {
  const listRef = useRef(null);
  const glisse = useRef(null); // { pointerId, index, ordre }
  const [apercu, setApercu] = useState(null);

  const terminer = () => {
    const g = glisse.current;
    glisse.current = null;
    setApercu(null);
    if (g && ordreChange(items, g.ordre)) onReorder(g.ordre);
  };

  const poignee = (index) => ({
    style: { touchAction: "none" },
    onPointerDown: (event) => {
      if (event.button > 0 || items.length < 2) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // capture indisponible : les événements arrivent quand même tant que le doigt reste sur la poignée
      }
      glisse.current = { pointerId: event.pointerId, index, ordre: items };
      setApercu(items);
    },
    onPointerMove: (event) => {
      const g = glisse.current;
      if (!g || event.pointerId !== g.pointerId) return;
      event.preventDefault();
      const enfants = [...(listRef.current?.children || [])];
      const milieux = enfants.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      const vers = positionCible(milieux, event.clientY, g.index);
      if (vers !== g.index) {
        g.ordre = deplacer(g.ordre, g.index, vers);
        g.index = vers;
        setApercu(g.ordre);
      }
      defilerAuBord(event.clientY);
    },
    onPointerUp: (event) => {
      if (glisse.current?.pointerId === event.pointerId) terminer();
    },
    // Android peut annuler le geste (notification, multi-doigts) : on garde ce que l'utilisateur voit.
    onPointerCancel: terminer,
    onLostPointerCapture: () => {
      if (glisse.current) terminer();
    },
  });

  const monter = (index) => {
    if (index > 0) onReorder(deplacer(items, index, index - 1));
  };
  const descendre = (index) => {
    if (index < items.length - 1) onReorder(deplacer(items, index, index + 1));
  };

  const ordre = apercu || items;
  const idGlisse = apercu && glisse.current ? ordre[glisse.current.index]?.id ?? null : null;
  return { listRef, ordre, poignee, monter, descendre, idGlisse };
}
