// Réponse rapide depuis une notification de message privé (APK : ChayConversationPlugin, Java).
// Le texte saisi dans la notification arrive ici ; il est envoyé comme depuis la conversation (même file
// d'attente hors ligne), puis la notification est retirée et la conversation s'ouvre.
import { envoyerMessageTexte } from "./messageSend.js";
import { routeCible, routeValide } from "./routesNotification.js";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const TEXTE_MAX = 4000;

/** Données reçues du natif -> { conversation, texte, route } ou null si inutilisables. */
export function lireReponse(data) {
  const conversation = data && typeof data.conversation === "string" ? data.conversation : "";
  if (!ID_RE.test(conversation)) return null;
  const texte = typeof data.texte === "string" ? data.texte.trim().slice(0, TEXTE_MAX) : "";
  const route = routeValide(data.route) ? data.route : routeCible("message", conversation);
  return { conversation, texte, route, aime: data.aime === true };
}

/**
 * @param {{ invoke, updateConversation, enqueue, effacer, navigate, toast }} deps
 * @returns {Promise<"envoye" | "en-attente" | "vide" | "erreur" | "ignore">}
 */
export async function traiterReponseRapide(deps, data) {
  const r = lireReponse(data);
  if (!r) return "ignore";
  let statut = "vide";
  if (r.texte) {
    try {
      const envoi = await envoyerMessageTexte(deps, { conversation_id: r.conversation, text: r.texte, reply_to_id: null });
      statut = envoi.statut;
    } catch (e) {
      statut = "erreur";
      deps.toast?.({ title: "Réponse non envoyée", description: e?.message || String(e), variant: "destructive" });
    }
  }
  await Promise.resolve(deps.effacer?.(r.conversation)).catch(() => {});
  // 1.3.34 : « J'aime 👍 » depuis la notification : on reste où l'on était.
  if (r.aime) {
    if (statut !== "erreur") deps.toast?.({ title: "👍 envoyé" });
    return statut;
  }
  deps.navigate(r.route);
  return statut;
}
