// Choix du backend, fixé au build par VITE_BACKEND :
//   - absent ou "base44" (défaut) : client Base44 d'origine, comportement inchangé ;
//   - "pocketbase"               : couche d'adaptation PocketBase (src/api/backend.js).
// VITE_PB_URL (optionnel) : URL du serveur PocketBase, https://api.chay.fr par défaut.

const env = import.meta.env || {};
const requested = String(env.VITE_BACKEND || 'base44').trim().toLowerCase();

if (requested !== 'base44' && requested !== 'pocketbase') {
  console.warn(`[backend] VITE_BACKEND="${requested}" inconnu : utilisation de base44.`);
}

export const BACKEND = requested === 'pocketbase' ? 'pocketbase' : 'base44';
export const IS_POCKETBASE = BACKEND === 'pocketbase';
export const PB_URL = String(env.VITE_PB_URL || 'https://api.chay.fr').replace(/\/+$/, '');
// VITE_PUBLIC_APP_URL (mode PocketBase) : adresse publique du site de l'app, pour les liens partagés
// depuis l'APK et pour l'image de la notification radio (défaut : https://app.chay.fr).
export const PB_PUBLIC_APP_URL = String(env.VITE_PUBLIC_APP_URL || 'https://app.chay.fr').replace(/\/+$/, '');

/** Texte selon le backend : le mode Base44 garde son texte d'origine. */
export const backendText = (base44Text, pocketbaseText) => (IS_POCKETBASE ? pocketbaseText : base44Text);

// Clé de stockage du authStore PocketBase (distincte de celles de Base44).
export const PB_AUTH_STORAGE_KEY = 'pocketbase_auth';

/** Jeton PocketBase enregistré dans ce navigateur (ou null). Ne touche pas au stockage Base44. */
export function readPocketBaseToken() {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PB_AUTH_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw)?.token || null : null;
  } catch {
    return null;
  }
}
