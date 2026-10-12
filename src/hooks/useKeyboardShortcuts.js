import { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Raccourcis clavier d'une superposition (galerie, visionneuse…).
//
//   useKeyboardShortcuts(active, { ArrowLeft: fn, ArrowRight: fn, Escape: fn })
//
// - Un seul écouteur `keydown` sur window, actif uniquement quand `active`.
// - Les gestionnaires sont lus via une ref : changer leur identité à chaque
//   rendu ne ré-abonne JAMAIS l'écouteur (donc aucune touche perdue).
// - Ignoré pendant la frappe dans un champ de saisie (flèches = déplacement du
//   curseur) sauf pour Échap, et pendant une composition IME.
// ─────────────────────────────────────────────────────────────────────────

const isTypingTarget = (el) => {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

export default function useKeyboardShortcuts(active, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.isComposing || e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const fn = ref.current?.[e.key];
      if (typeof fn !== "function") return;
      if (isTypingTarget(e.target) && e.key !== "Escape") return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

// Touche « Entrée » d'un champ d'envoi : envoie sans Maj, ignore la
// composition IME (clavier mobile/asiatique) et les répétitions de touche.
export function onEnterSubmit(submit) {
  return (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing || e.repeat) return;
    e.preventDefault();
    submit();
  };
}