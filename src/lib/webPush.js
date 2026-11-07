import { base44 } from "@/api/base44Client";
import { IS_POCKETBASE } from "@/api/backendConfig";
import {
  ensurePushSubscription,
  resolveVapidPublicKey,
  saveSubscriptionRecord,
} from "@/lib/webPushCore";

// Push navigateur (Web Push / VAPID).
// - Mode base44 : ancienne clé publique codée en dur (clé privée dans le secret Base44).
// - Mode PocketBase : nouvelle paire ; clé publique lue dans VITE_VAPID_PUBLIC_KEY (build),
//   clé privée dans le sidecar push (VAPID_PRIVATE_KEY). Un abonnement créé avec une autre
//   clé (l'ancienne de Base44) est automatiquement remplacé.
// - Les abonnements sont persistés dans l'entité WebPushSubscription,
//   un row par appareil (endpoint unique).
// - public/sw.js affiche la notification système et renvoie le clic ici.
export const VAPID_PUBLIC_KEY = resolveVapidPublicKey(
  IS_POCKETBASE,
  (import.meta.env || {}).VITE_VAPID_PUBLIC_KEY
);

const SW_URL = "/sw.js";

function emitWebPushStateChange() {
  window.dispatchEvent(new Event("chay-web-push-state-change"));
}

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

// Abonne cet appareil (ou réutilise l'abonnement) puis l'enregistre côté serveur.
// Ré-abonnement automatique si la clé publique a changé : mode PocketBase seulement.
async function subscribeAndSave(registration, userId) {
  const { subscription, previousEndpoint } = await ensurePushSubscription(
    registration.pushManager,
    VAPID_PUBLIC_KEY,
    { resubscribeOnKeyChange: IS_POCKETBASE }
  );
  await saveSubscriptionRecord(base44.entities.WebPushSubscription, userId, subscription, {
    previousEndpoint,
    userAgent: navigator.userAgent,
  });
}

// Demande la permission puis (ré)abonne cet appareil. À appeler depuis un
// clic utilisateur : la permission navigateur exige une gestuelle (Safari).
export async function enableWebPush(userId) {
  if (!isWebPushSupported()) {
    throw new Error("Ce navigateur ne prend pas en charge les notifications.");
  }
  if (!userId) throw new Error("Connectez-vous pour activer les notifications.");
  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error("Permission de notifications refusée dans le navigateur.");
  }
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await subscribeAndSave(registration, userId);
  emitWebPushStateChange();
}

// Désabonne cet appareil (le row est marqué inactif, jamais supprimé —
// on garde la trace pour le diagnostic).
export async function disableWebPush() {
  if (!isWebPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration
    ? await registration.pushManager.getSubscription()
    : null;
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  const rows = await base44.entities.WebPushSubscription.filter(
    { endpoint },
    null,
    1
  );
  if (Array.isArray(rows) && rows[0]) {
    await base44.entities.WebPushSubscription.update(rows[0].id, {
      is_active: false,
      last_seen: new Date().toISOString(),
    });
  }
  emitWebPushStateChange();
}

// À l'ouverture de l'app : si la permission est déjà accordée, (ré)abonne
// cet appareil silencieusement (aucune demande intrusive). Un abonnement
// révoqué (logout, nettoyage navigateur) est ainsi recréé automatiquement.
export async function syncWebPush(userId) {
  if (!userId || !isWebPushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await subscribeAndSave(registration, userId);
    emitWebPushStateChange();
  } catch (error) {
    console.warn("[WebPush] Abonnement silencieux impossible.", error);
  }
}

export async function webPushState(userId) {
  const supported = isWebPushSupported();
  const permission = typeof Notification !== "undefined" ? Notification.permission : "denied";
  let subscribed = false;
  let registered = false;
  let registrationError = null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null;
    subscribed = Boolean(subscription);
    if (subscription && userId) {
      const rows = await base44.entities.WebPushSubscription.filter(
        { endpoint: subscription.endpoint },
        null,
        1
      );
      registered = Array.isArray(rows) && rows.some(
        (row) => row.user_id === userId && row.is_active !== false
      );
    }
  } catch (error) {
    registrationError = error?.message || String(error);
  }
  return { supported, permission, subscribed, registered, registrationError };
}

// Clic sur une notification push : le service worker renvoie l'URL cible.
export function onWebPushNotificationClick(handler) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }
  const listener = (event) => {
    const data = event.data;
    if (data && data.type === "chay-notification-click") handler(data);
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
