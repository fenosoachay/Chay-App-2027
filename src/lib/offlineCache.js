// Couche générique de cache hors-ligne basée sur la Cache Storage API.
// Utilisée par localBible / bibleConcordance pour persister les textes
// bibliques et les index de concordance afin qu'ils restent disponibles sans
// réseau.
//
// Deux familles d'aides :
//  - *Json : stocke/relit des objets JSON arbitraires sous une clé logique.
//  - *Url  : met en cache la réponse brute d'une requête réseau (utilisé pour
//    les fichiers audio), pour un rejeu hors-ligne via Blob/ObjectURL.

const CACHE_NAME = "chay-bible-offline-v1";
const JSON_ORIGIN = "https://offline.chay.local/json/";

export function isCacheStorageAvailable() {
  return typeof caches !== "undefined";
}

async function openCache() {
  return caches.open(CACHE_NAME);
}

function jsonRequest(key) {
  return new Request(JSON_ORIGIN + encodeURIComponent(key));
}

export async function getCachedJson(key) {
  if (!isCacheStorageAvailable()) return null;
  try {
    const cache = await openCache();
    const res = await cache.match(jsonRequest(key));
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function setCachedJson(key, data) {
  if (!isCacheStorageAvailable()) return false;
  try {
    const cache = await openCache();
    const res = new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put(jsonRequest(key), res);
    return true;
  } catch {
    return false;
  }
}

export async function deleteCachedJson(key) {
  if (!isCacheStorageAvailable()) return false;
  try {
    const cache = await openCache();
    return await cache.delete(jsonRequest(key));
  } catch {
    return false;
  }
}

// --- Fichiers bruts (audio) -------------------------------------------------

export async function isUrlCached(url) {
  if (!isCacheStorageAvailable() || !url) return false;
  try {
    const cache = await openCache();
    return !!(await cache.match(url));
  } catch {
    return false;
  }
}

// Télécharge et stocke la réponse réseau telle quelle (utilisé pour l'audio).
// Retourne true si le fichier est disponible en cache à l'issue de l'appel.
export async function cacheUrl(url) {
  if (!isCacheStorageAvailable() || !url) return false;
  try {
    const cache = await openCache();
    if (await cache.match(url)) return true;
    const res = await fetch(url);
    if (!res.ok) return false;
    await cache.put(url, res.clone());
    return true;
  } catch {
    return false;
  }
}

export async function deleteCachedUrl(url) {
  if (!isCacheStorageAvailable() || !url) return false;
  try {
    const cache = await openCache();
    return await cache.delete(url);
  } catch {
    return false;
  }
}

// Renvoie une ObjectURL locale pointant vers le blob mis en cache, ou null.
export async function getCachedUrlAsObjectUrl(url) {
  if (!isCacheStorageAvailable() || !url) return null;
  try {
    const cache = await openCache();
    const res = await cache.match(url);
    if (!res) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}