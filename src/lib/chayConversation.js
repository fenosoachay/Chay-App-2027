// Plugin natif ChayConversation (android/…/ChayConversationPlugin.java), partagé par l'app :
//  - « reponse » : réponse rapide d'une notification de message privé (usePushNotifications) ;
//  - « ouvrir » : toucher la notification de lecture -> route du titre en cours (useOuvrirDepuisLecture).
import { Capacitor, registerPlugin } from "@capacitor/core";

export const ChayConversation = registerPlugin("ChayConversation");

// Mise à jour de l'application depuis l'application (ChayMiseAJourPlugin.java, voir src/lib/miseAJour.js).
export const ChayMiseAJour = registerPlugin("ChayMiseAJour");

export function estNatif() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
