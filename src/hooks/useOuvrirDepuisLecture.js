import { useEffect } from "react";
import { ChayConversation, estNatif } from "@/lib/chayConversation";
import { routeValide } from "@/lib/routesNotification";

/**
 * Toucher la notification de lecture (APK) : l'app s'ouvre sur le titre en cours, dans sa playlist
 * (Musique, Prédication, Votre Playlist) ou sur la radio. App fermée : l'évènement natif est gardé
 * jusqu'à cette écoute. Indépendant du réglage des notifications push.
 */
export function useOuvrirDepuisLecture(navigate) {
  useEffect(() => {
    if (!estNatif()) return undefined;
    let poignee = null;
    let actif = true;
    ChayConversation.addListener("ouvrir", (data) => {
      if (routeValide(data?.route)) navigate(data.route);
    }).then((h) => {
      if (actif) poignee = h;
      else h.remove();
    }).catch(() => {});
    return () => {
      actif = false;
      poignee?.remove?.();
    };
  }, [navigate]);
}
