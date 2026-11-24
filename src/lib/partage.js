// Partage (1.3.25) : la fenêtre de partage du téléphone s'ouvre avec toutes ses applications (WhatsApp, SMS…).
//  - app Android : plugin natif ChayPartage (la WebView n'a pas navigator.share) ;
//  - navigateur : navigator.share, sinon copie du texte.
// Résultat : "partage" | "copie" | "annule".
import { registerPlugin } from "@capacitor/core";
import { estNatif } from "./chayConversation.js";
import { APK_URL } from "./apkRelease.js";

const ChayPartage = registerPlugin("ChayPartage");

/** Texte d'un verset à partager : référence [LSG], ligne vide, « N. texte », ligne vide, lien de l'APK. */
export function texteVerset(reference, texte) {
  const ref = String(reference || "").trim();
  const deuxPoints = ref.lastIndexOf(":");
  const numero = deuxPoints >= 0 ? ref.slice(deuxPoints + 1).trim() : "";
  const corps = String(texte || "").trim();
  return `${ref} [LSG]\n\n${numero ? `${numero}. ` : ""}${corps}\n\n${APK_URL}`;
}

export async function partagerTexte({ titre = "Partager", texte }) {
  if (estNatif()) {
    try {
      await ChayPartage.partager({ titre, texte });
      return "partage";
    } catch {
      /* ancienne APK sans le plugin : on essaie la suite */
    }
  }
  const nav = globalThis.navigator;
  if (nav?.share) {
    try {
      await nav.share({ title: titre, text: texte });
      return "partage";
    } catch (e) {
      if (e?.name === "AbortError") return "annule";
    }
  }
  try {
    await nav.clipboard.writeText(texte);
    return "copie";
  } catch {
    return "annule";
  }
}
