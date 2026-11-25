// Envoi d'un message texte (ConversationView).
//
// navigator.onLine n'est PAS un critère : dans la WebView Android, il peut valoir false alors que le réseau
// fonctionne ; le message partait alors dans la file locale, sans être affiché nulle part (ni chez
// l'expéditeur), et n'était renvoyé qu'à un évènement « online » qui pouvait ne jamais venir.
// Ici : l'envoi est TOUJOURS tenté ; la file n'est utilisée qu'en cas d'échec réseau réel.

/** Erreur réseau (serveur injoignable), et non refus du serveur (400, 403, 429…). */
export function isNetworkError(e) {
  if (!e) return false;
  if (e.code === "network_error") return true;
  if (e.status === 0) return true;
  return e instanceof TypeError && /fetch|network|load failed/i.test(String(e.message || ""));
}

/**
 * @param {{ invoke: Function, updateConversation: Function, enqueue: Function }} deps
 * @param {{ conversation_id: string, text: string, reply_to_id: string|null }} body
 * @returns {Promise<{ statut: "envoye", result: any } | { statut: "en-attente" }>}
 */
/** 1.3.35 : clé unique d'un envoi : renvoyée telle quelle en cas de nouvel essai, le serveur ne crée pas de doublon. */
export function cleEnvoi() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function envoyerMessageTexte({ invoke, updateConversation, enqueue }, bodyIn) {
  // La même clé accompagne le message dans la file d'attente : s'il était déjà arrivé (réponse perdue),
  // le renvoi ne le crée pas une deuxième fois.
  const body = bodyIn.cle_envoi ? bodyIn : { ...bodyIn, cle_envoi: cleEnvoi() };
  let result;
  try {
    result = await invoke("createMessage", body);
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue("message", { body });
      return { statut: "en-attente" };
    }
    throw e; // refus du serveur : affiché à l'utilisateur, texte remis dans la zone de saisie
  }
  // Le message EST créé : un échec de la mise à jour de l'aperçu de la conversation ne doit pas faire
  // croire à un échec (sinon le texte revient dans la zone de saisie et un nouvel envoi crée un doublon).
  await Promise.resolve(updateConversation(body.conversation_id, {
    last_message_text: body.text,
    last_message_at: result?.data?.created_date || new Date().toISOString(),
    typing_user_id: null,
    typing_at: null,
  })).catch(() => {});
  return { statut: "envoye", result };
}
