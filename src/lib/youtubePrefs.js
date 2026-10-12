// Préférences YouTube (ordre des playlists, cadenas, mode aléatoire), par
// utilisateur ET par catégorie. Le stockage local est la référence (marche hors
// ligne) ; si l'utilisateur est connecté, une copie est synchronisée sur son
// compte (champ youtube_prefs).
import { base44 } from "@/api/base44Client";

const EMPTY = { playlist_orders: {}, playlist_locks: {}, shuffle_modes: {} };
const keyFor = (userId) => `chay_youtube_prefs_${userId || "guest"}`;

export function loadYoutubePrefs(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || "null");
    return { ...EMPTY, ...(raw || {}) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveYoutubePrefs(userId, prefs) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(prefs));
  } catch {
    // Stockage plein ou indisponible : on ignore.
  }
}

// Envoi vers le compte ; échec silencieux (hors ligne) : le local reste valable.
export async function syncYoutubePrefs(userId, prefs) {
  if (!userId || (typeof navigator !== "undefined" && !navigator.onLine)) return false;
  try {
    await base44.auth.updateMe({ youtube_prefs: prefs });
    return true;
  } catch {
    return false;
  }
}

// Fusionne la copie serveur avec la copie locale (le local gagne s'il existe).
export function mergeYoutubePrefs(local, remote) {
  const r = remote && typeof remote === "object" ? remote : {};
  return {
    playlist_orders: { ...(r.playlist_orders || {}), ...local.playlist_orders },
    playlist_locks: { ...(r.playlist_locks || {}), ...local.playlist_locks },
    shuffle_modes: { ...(r.shuffle_modes || {}), ...local.shuffle_modes },
  };
}

// Applique l'ordre enregistré (liste d'ids) ; les nouvelles vidéos vont à la fin.
export function applySavedOrder(items, orderIds) {
  if (!Array.isArray(orderIds) || !orderIds.length) return items;
  const pos = new Map(orderIds.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id) : Infinity;
    const pb = pos.has(b.id) ? pos.get(b.id) : Infinity;
    return pa === pb ? 0 : pa - pb;
  });
}

// Mélange de Fisher-Yates (copie, ne modifie pas la liste d'origine).
export function shuffleArray(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}