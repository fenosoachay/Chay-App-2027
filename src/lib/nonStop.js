// « Votre Playlist » › Lecture non-stop : réglage de ce téléphone (localStorage). Quand il est activé, les titres de
// Votre Playlist s'enchaînent en fondu (les 5 dernières secondes d'un titre, le suivant monte pendant que le
// premier baisse) et la playlist recommence au début après le dernier titre.
import { useEffect, useState } from "react";

export const CLE_NON_STOP = "chay_lecture_non_stop";
export const DUREE_FONDU_S = 5;
const EVENEMENT = "chay-non-stop";

export function lireNonStop(storage = globalThis.localStorage) {
  try { return storage?.getItem(CLE_NON_STOP) === "1"; } catch { return false; }
}

export function definirNonStop(actif, storage = globalThis.localStorage) {
  try { storage?.setItem(CLE_NON_STOP, actif ? "1" : "0"); } catch { /* réglage pour cette session seulement */ }
  try { globalThis.dispatchEvent?.(new CustomEvent(EVENEMENT, { detail: Boolean(actif) })); } catch { /* ignore */ }
}

/** [actif, definir] : suit les changements faits ailleurs dans l'app. */
export function useNonStop() {
  const [actif, setActif] = useState(() => lireNonStop());
  useEffect(() => {
    const ecouter = (e) => setActif(Boolean(e.detail));
    globalThis.addEventListener?.(EVENEMENT, ecouter);
    return () => globalThis.removeEventListener?.(EVENEMENT, ecouter);
  }, []);
  return [actif, definirNonStop];
}

/** Fondu à lancer ? (titre de Votre Playlist, réglage actif, assez long, dans ses 5 dernières secondes). */
export function doitFondre({ actif, origine, temps, duree, fonduEnCours }) {
  if (!actif || origine !== "favoris" || fonduEnCours) return false;
  if (!(duree > DUREE_FONDU_S * 2)) return false;
  const reste = duree - temps;
  return reste <= DUREE_FONDU_S && reste > 0.3;
}
