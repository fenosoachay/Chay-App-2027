import React, { useEffect, useRef } from "react";
import { Image } from "@/components/ui/image";
import BadgeAudience from "@/components/media/BadgeAudience";

// Photo de la Galerie (1.3.42) : apparaît en douceur quand elle arrive à l'écran en faisant défiler (fondu,
// légère montée, l'image se pose), une colonne après l'autre ; s'enfonce un peu sous le doigt.
// Un seul observateur pour toutes les photos ; rien ne bouge si « Réduire les animations » est activé.
let observateur = null;
const suivis = new WeakMap();
function observer(el, surVisible) {
  if (typeof IntersectionObserver === "undefined") { surVisible(); return () => {}; }
  if (!observateur) {
    observateur = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        const f = suivis.get(e.target);
        observateur.unobserve(e.target);
        suivis.delete(e.target);
        f?.();
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 });
  }
  suivis.set(el, surVisible);
  observateur.observe(el);
  return () => { observateur?.unobserve(el); suivis.delete(el); };
}

export default function TuileGalerie({ image, index = 0, onClick, arrondi = "", label }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    return observer(el, () => el.classList.add("chay-tuile-visible"));
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      style={{ "--chay-delai": `${(index % 4) * 70}ms` }}
      className={`chay-tuile relative block aspect-square overflow-hidden bg-muted group ${arrondi}`}
      aria-label={label || image.title || "Photo"}
    >
      <Image src={image.image_url} fittingType="fill" className="chay-tuile-img w-full h-full object-cover" />
      <BadgeAudience audience={image.audience} className="absolute bottom-1.5 left-1.5" />
    </button>
  );
}
