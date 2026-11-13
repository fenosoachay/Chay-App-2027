import { useEffect, useReducer, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { subscribeMediaControl } from "@/lib/mediaControl";
import { LECTURE_MIN_MS, abonnerCompteurs, cleVue, compteurDe, creerSuiviMoitie, noterCompteur } from "@/lib/vues";

/** +1 vue côté serveur (route compterVue) ; le compteur renvoyé met l'affichage à jour. Échec silencieux. */
export async function compterVue(vue) {
  if (!cleVue(vue)) return;
  try {
    const r = await base44.functions.invoke("compterVue", { type: vue.type, id: vue.id });
    noterCompteur(vue, r?.data?.view_count);
  } catch {
    // Compteur indicatif : une vue perdue (hors ligne…) ne gêne pas la lecture.
  }
}

/**
 * Monté une fois (Layout) : audio du lecteur global (Musique, Prédication, Votre Playlist) et lecteurs vidéo et
 * YouTube (contrôle média global) comptent une vue à la moitié, une fois par ouverture.
 */
export function useCompteurVues() {
  const { currentTrack, currentTime, duration } = useAudioPlayer();
  const suiviAudio = useRef(null);
  const suiviMedia = useRef(null);
  if (!suiviAudio.current) suiviAudio.current = creerSuiviMoitie(compterVue);
  if (!suiviMedia.current) suiviMedia.current = creerSuiviMoitie(compterVue);

  useEffect(() => {
    suiviAudio.current(currentTrack?.queueId ?? currentTrack?.id, currentTrack?.vue, currentTime, duration);
  }, [currentTrack, currentTime, duration]);

  useEffect(() => subscribeMediaControl((c) => {
    if (c && (c.type === "youtube" || c.type === "video")) suiviMedia.current(c.id, c.vue, c.currentTime, c.duration);
  }), []);
}

/**
 * Article / actualité : +1 vue après 2 minutes de lecture effective (onglet visible), une fois par ouverture.
 * `ouverte` : le contenu est affiché.
 */
export function useLectureMinimale(vue, ouverte, minimumMs = LECTURE_MIN_MS) {
  const cle = cleVue(vue);
  useEffect(() => {
    if (!ouverte || !cle) return undefined;
    let lu = 0;
    let dernier = Date.now();
    const pas = Math.min(1000, minimumMs);
    const t = setInterval(() => {
      const maintenant = Date.now();
      if (typeof document === "undefined" || document.visibilityState === "visible") lu += maintenant - dernier;
      dernier = maintenant;
      if (lu >= minimumMs) {
        clearInterval(t);
        compterVue(vue);
      }
    }, pas);
    return () => clearInterval(t);
  }, [ouverte, cle, minimumMs]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Compteur affiché, mis à jour quand le serveur en renvoie un nouveau pendant la session. */
export function useCompteur(vue, base) {
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  const cle = cleVue(vue);
  useEffect(() => abonnerCompteurs((c) => { if (c === cle) rafraichir(); }), [cle]);
  return compteurDe(vue, base);
}
