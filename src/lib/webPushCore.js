// Logique Web Push sans dépendance au navigateur ni au backend (testable avec des mocks).
// Utilisée par src/lib/webPush.js.

// Ancienne clé publique VAPID de Base44 : conservée UNIQUEMENT pour le mode base44.
// En mode PocketBase, sa clé privée est irrécupérable : une nouvelle paire est utilisée (VITE_VAPID_PUBLIC_KEY).
export const BASE44_VAPID_PUBLIC_KEY =
  "BCWq_4_Qu_DqSH3SR-s0xyCt8gE29xZ4LilwMf3Hp5DyekihEmRVGkt7fwsCoago_sXoD23roB20zW5sZNnC_LE";

/** Clé publique VAPID selon le backend ("" si le mode PocketBase n'en a pas : push navigateur indisponible). */
export function resolveVapidPublicKey(isPocketBase, envKey) {
  if (!isPocketBase) return BASE44_VAPID_PUBLIC_KEY;
  const key = String(envKey || "").trim();
  return /^[A-Za-z0-9_-]{80,100}$/.test(key) ? key : "";
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

/**
 * L'abonnement a-t-il été créé avec une AUTRE clé publique ?
 * Si le navigateur n'expose pas options.applicationServerKey, on ne peut pas savoir : false (on garde).
 */
export function subscriptionUsesOtherKey(subscription, expectedKeyBytes) {
  const current = toBytes(subscription?.options?.applicationServerKey);
  if (!current) return false;
  if (current.length !== expectedKeyBytes.length) return true;
  for (let i = 0; i < current.length; i += 1) if (current[i] !== expectedKeyBytes[i]) return true;
  return false;
}

/**
 * Renvoie un abonnement valable pour `publicKey` :
 * - aucun abonnement : en crée un ;
 * - abonnement créé avec une autre clé (ex. l'ancienne clé Base44) et `resubscribeOnKeyChange` :
 *   désabonne puis en crée un nouveau ; `previousEndpoint` permet de remplacer l'ancien enregistrement.
 * @returns {Promise<{ subscription, previousEndpoint: string|null, renewed: boolean }>}
 */
export async function ensurePushSubscription(pushManager, publicKey, { resubscribeOnKeyChange = true } = {}) {
  const keyBytes = urlBase64ToUint8Array(publicKey);
  const subscribe = () => pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
  const existing = await pushManager.getSubscription();
  if (!existing) return { subscription: await subscribe(), previousEndpoint: null, renewed: false };
  if (!resubscribeOnKeyChange || !subscriptionUsesOtherKey(existing, keyBytes)) {
    return { subscription: existing, previousEndpoint: null, renewed: false };
  }
  const previousEndpoint = existing.endpoint;
  await existing.unsubscribe();
  return { subscription: await subscribe(), previousEndpoint, renewed: true };
}

/**
 * Enregistre l'abonnement côté serveur (entité WebPushSubscription, une ligne par appareil).
 * Si `previousEndpoint` est donné (ré-abonnement après changement de clé), l'ancienne ligne est
 * REMPLACÉE (mise à jour avec le nouvel endpoint et les nouvelles clés) au lieu d'en créer une nouvelle.
 */
export async function saveSubscriptionRecord(entity, userId, subscription, { previousEndpoint = null, userAgent = "" } = {}) {
  const keys = (subscription.toJSON() || {}).keys || {};
  const payload = {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh || "",
    auth: keys.auth || "",
    user_agent: String(userAgent).slice(0, 300),
    is_active: true,
    last_seen: new Date().toISOString(),
  };
  const first = async (endpoint) => {
    const rows = await entity.filter({ endpoint }, null, 1);
    return (Array.isArray(rows) && rows[0]) || null;
  };
  const current = await first(payload.endpoint);
  const previous = previousEndpoint && previousEndpoint !== payload.endpoint ? await first(previousEndpoint) : null;
  if (current) {
    await entity.update(current.id, payload);
    // Cas rare : les deux lignes existent ; l'ancienne ne doit plus recevoir d'envoi.
    if (previous) await entity.update(previous.id, { is_active: false, last_seen: payload.last_seen });
  } else if (previous) {
    await entity.update(previous.id, payload);
  } else {
    await entity.create(payload);
  }
  return payload;
}
