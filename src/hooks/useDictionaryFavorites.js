import { useCallback, useState } from "react";

// Mots favoris du dictionnaire, mémorisés sur l'appareil.
const KEY = "chay_dictionary_favorites";

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function useDictionaryFavorites() {
  const [favorites, setFavorites] = useState(read);

  const toggle = useCallback((mot) => {
    setFavorites((prev) => {
      const next = prev.includes(mot) ? prev.filter((m) => m !== mot) : [...prev, mot];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* stockage indisponible : le favori reste valable pour la session */
      }
      return next;
    });
  }, []);

  return { favorites, toggle };
}