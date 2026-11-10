// Push reçu alors que l'APK est AU PREMIER PLAN : Android n'affiche alors aucune notification système
// (le plugin la transmet seulement à l'app). Pour les messages, le bandeau in-app vient de la
// UserNotification temps réel (pas de doublon ici). Pour le TEST du bouton « Tester le push Android »
// (envoyé pendant que l'app est ouverte, par construction), on affiche un bandeau qui prouve la réception.

export const PUSH_TEST_TARGET = "test";

/** Bandeau à afficher pour un push reçu au premier plan, ou null. */
export function foregroundPushToast(notification) {
  const data = notification?.data || {};
  if (data.target_type !== PUSH_TEST_TARGET) return null;
  const corps = String(notification?.body || "").trim();
  return {
    title: "Notification de test reçue",
    description: `${corps ? `${corps} ` : ""}(app ouverte : Android n'affiche pas de notification système au premier plan).`,
  };
}
