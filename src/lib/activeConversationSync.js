// « Conversation ouverte » (MemberProfile.active_conversation_id) : le serveur ne notifie pas un destinataire
// en ligne qui a la conversation ouverte. Il faut donc la vider dès que l'utilisateur ne la regarde plus
// (onglet en arrière-plan, page masquée, app Android en arrière-plan) et la remettre à son retour.
// Sans dépendance (testable avec node --test).

/**
 * @param {string} conversationId conversation affichée
 * @param {(value: string) => Promise<unknown>} write écrit active_conversation_id (id ou "")
 * @returns {{ visible(): void, hidden(): void, dispose(): void, settled(): Promise<void> }}
 */
export function createActiveConversationSync(conversationId, write) {
  let last = null;
  let disposed = false;
  let chain = Promise.resolve();
  // Écritures une par une (une valeur « vide » ne doit pas doubler une valeur « conversation » en cours),
  // et seulement quand la valeur change.
  const set = (value) => {
    if (value === last) return;
    last = value;
    chain = chain.then(() => write(value)).catch(() => {});
  };
  return {
    visible() { if (!disposed) set(conversationId); },
    hidden() { if (!disposed) set(""); },
    dispose() { disposed = true; set(""); },
    settled() { return chain; },
  };
}
