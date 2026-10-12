import { useCallback, useEffect, useState } from "react";

// Mots favoris de la concordance, mémorisés sur l'appareil (par langue).
const key = (lang) => `chay_concordance_favorites_${lang}`;

function read(lang) {
  try {
    const v = JSON.parse(localStorage.getItem(key(lang)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function useConcordanceFavorites(lang) {
  const [favorites, setFavorites] = useState(() => read(lang));

  useEffect(() => {
    setFavorites(read(lang));
  }, [lang]);

  const toggle = useCallback(
    (word) => {
      setFavorites((prev) => {
        const next = prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word];
        try {
          localStorage.setItem(key(lang), JSON.stringify(next));
        } catch {
          /* stockage indisponible : le favori reste valable pour la session */
        }
        return next;
      });
    },
    [lang]
  );

  return { favorites, toggle };
}