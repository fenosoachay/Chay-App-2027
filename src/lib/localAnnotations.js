// Copie locale des annotations (surlignages / notes) faites hors ligne,
// pour qu'elles restent visibles avant d'être envoyées au serveur.
const key = (t, b, c) => `chay_local_annotations_${t}_${b}_${c}`;

export function readLocalAnnotations(t, b, c) {
  try {
    return JSON.parse(localStorage.getItem(key(t, b, c)) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveLocalAnnotation(t, b, c, verse, data) {
  const map = readLocalAnnotations(t, b, c);
  map[verse] = { ...(map[verse] || {}), verse, ...data, _pending: true };
  try {
    localStorage.setItem(key(t, b, c), JSON.stringify(map));
  } catch {
    /* stockage indisponible */
  }
}

// Une fois le serveur à jour, la copie locale n'est plus nécessaire.
export function clearLocalAnnotations(t, b, c) {
  try {
    localStorage.removeItem(key(t, b, c));
  } catch {
    /* rien */
  }
}