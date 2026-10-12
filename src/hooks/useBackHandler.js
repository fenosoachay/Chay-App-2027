import { useEffect, useRef } from "react";
import { createOverlayHistoryState, OVERLAY_HISTORY_KEY } from "@/lib/backNavigation";

// ─────────────────────────────────────────────────────────────────────────
// Bouton retour (téléphone, navigateur, geste) pour les superpositions :
// modales, tiroirs, galeries, lecteurs plein écran, appels…
//
// MODÈLE (volontairement simple et déterministe) :
//   • UNE entrée d'historique synthétique par superposition ouverte.
//   • Une pile `stack` ordonnée par ouverture : la dernière ouverte est
//     toujours celle que « retour » ferme.
//   • Retour (popstate) → on ferme le sommet de la pile. L'entrée
//     d'historique correspondante a déjà été consommée par le navigateur.
//   • Fermeture par bouton X / Échap / code → on retire la superposition de
//     la pile et on consomme son entrée avec history.back(). Ce `back()` est
//     COMPTÉ dans `pendingSelfBacks` pour que le popstate qu'il provoque soit
//     ignoré (il ne doit fermer aucune autre superposition).
//
// Pourquoi l'ancienne version était aléatoire : elle marquait l'entrée via
// `history.state` (cloné par le navigateur → marqueur perdu) et partageait
// une seule entrée entre plusieurs superpositions. Ici, tout l'état vit dans
// des variables de module, jamais dans l'historique du navigateur.
//
// Ne PAS modifier ce fichier sans relancer les tests de navigation.
// ─────────────────────────────────────────────────────────────────────────

const stack = []; // [{ id, close, entryPushed }]
let pendingSelfBacks = 0; // history.back() que NOUS avons déclenchés
let nextId = 1;

const LISTENER_KEY = "__chay_back_listener__";

function onPopState() {
  // popstate provoqué par notre propre history.back() (fermeture par X) :
  // l'entrée est déjà consommée et la superposition déjà retirée → rien à faire.
  if (pendingSelfBacks > 0) {
    pendingSelfBacks -= 1;
    return;
  }
  // Vrai retour utilisateur : on ferme la superposition la plus récente.
  const top = stack.pop();
  if (!top) return; // aucune superposition : React Router gère la navigation
  top.entryPushed = false; // l'entrée vient d'être consommée par le retour
  try { top.close(); } catch { /* le handler de fermeture ne doit jamais casser le retour */ }
}

function ensureListener() {
  // Un seul listener, même après HMR : on retire toujours l'ancien.
  const previous = window[LISTENER_KEY];
  if (previous === onPopState) return;
  if (previous) window.removeEventListener("popstate", previous);
  window.addEventListener("popstate", onPopState);
  window[LISTENER_KEY] = onPopState;
}

export function hasOpenOverlay() {
  return stack.length > 0;
}

/**
 * useBackHandler(open, onClose)
 *
 * Tant que `open` est vrai, le bouton retour ferme CETTE superposition
 * (la plus récemment ouverte d'abord) au lieu de quitter la page.
 * `onClose` est lu via une ref : changer son identité ne ré-abonne rien.
 */
export function useBackHandler(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    ensureListener();

    const entry = {
      id: nextId++,
      close: () => onCloseRef.current && onCloseRef.current(),
      entryPushed: true,
    };
    stack.push(entry);
    window.history.pushState(createOverlayHistoryState(window.history.state), "");

    return () => {
      const i = stack.indexOf(entry);
      if (i === -1) return; // déjà retirée par un retour utilisateur
      stack.splice(i, 1);
      // Fermée autrement que par « retour » (X, Échap, code, démontage) :
      // on consomme l'entrée d'historique qu'on avait poussée.
      if (entry.entryPushed) {
        const st = window.history.state;
        if (st && typeof st === "object" && st[OVERLAY_HISTORY_KEY]) {
          pendingSelfBacks += 1;
          window.history.back();
        }
      }
    };
  }, [open]);
}

// Compatibilité : ancien nom de hook utilisé dans les primitives/overlays.
export const useCloseModalRequest = useBackHandler;
export { hasOpenOverlay as hasOpenModal };