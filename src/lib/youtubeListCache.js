// Cache de la liste des vidéos YouTube (titres, miniatures, sections) pour
// l'afficher hors ligne. Mis à jour à chaque chargement réussi.
const KEY = "chay_youtube_list_v1";

export function readYoutubeListCache() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeYoutubeListCache(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Stockage plein : on garde simplement l'ancienne copie.
  }
}

// Charge la liste ; en cas d'échec réseau, retombe sur la copie en cache.
export async function loadYoutubeListWithCache(fetchList) {
  try {
    const list = await fetchList();
    if (Array.isArray(list)) {
      writeYoutubeListCache(list);
      return list;
    }
  } catch {
    // Hors ligne ou erreur serveur : on utilise le cache.
  }
  return readYoutubeListCache();
}