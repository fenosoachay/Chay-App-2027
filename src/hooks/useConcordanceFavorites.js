import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Favoris de la concordance, synchronisés avec le compte utilisateur (par
// langue). Même logique que useDictionaryFavorites : localStorage en cache
// instantané + serveur pour la persistance entre appareils + migration.
const key = (lang) => `chay_concordance_favorites_${lang}`;
const readLocal = (lang) => {
  try {
    const v = JSON.parse(localStorage.getItem(key(lang)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeLocal = (lang, list) => {
  try {
    localStorage.setItem(key(lang), JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
};

export default function useConcordanceFavorites(lang) {
  const { user, isLocalMode } = useAuth();
  const [favorites, setFavorites] = useState(() => readLocal(lang));
  const migratedRef = useRef(false);

  useEffect(() => {
    setFavorites(readLocal(lang));
  }, [lang]);

  useEffect(() => {
    if (isLocalMode || !user?.id || !navigator.onLine) return undefined;
    let alive = true;
    (async () => {
      try {
        const page = await base44.entities.ConcordanceFavorite.filter(
          { lang },
          { sort: "-word", limit: 500 }
        );
        let serverRows = Array.isArray(page) ? page : page?.items || [];
        let serverWords = serverRows.map((r) => r.word);
        const local = readLocal(lang);
        const toCreate = local.filter((w) => !serverWords.includes(w));
        if (toCreate.length && !migratedRef.current) {
          migratedRef.current = true;
          await base44.entities.ConcordanceFavorite.bulkCreate(
            toCreate.map((w) => ({ word: w, lang }))
          ).catch(() => {});
          const page2 = await base44.entities.ConcordanceFavorite.filter(
            { lang },
            { sort: "-word", limit: 500 }
          );
          serverRows = Array.isArray(page2) ? page2 : page2?.items || [];
          serverWords = serverRows.map((r) => r.word);
        }
        if (!alive) return;
        const merged = Array.from(new Set([...serverWords, ...local]));
        writeLocal(lang, merged);
        setFavorites(merged);
      } catch {
        /* garde le cache local */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, isLocalMode, lang]);

  const toggle = useCallback(
    (word) => {
      const wasFavorite = readLocal(lang).includes(word);
      setFavorites((prev) => {
        const next = prev.includes(word)
          ? prev.filter((w) => w !== word)
          : [...prev, word];
        writeLocal(lang, next);
        return next;
      });
      if (isLocalMode || !user?.id || !navigator.onLine) return;
      if (wasFavorite) {
        (async () => {
          try {
            const page = await base44.entities.ConcordanceFavorite.filter(
              { word, lang },
              { limit: 1 }
            );
            const arr = Array.isArray(page) ? page : page?.items || [];
            if (arr[0]) await base44.entities.ConcordanceFavorite.delete(arr[0].id);
          } catch {
            /* réconciliation au prochain chargement */
          }
        })();
      } else {
        base44.entities.ConcordanceFavorite
          .create({ word, lang })
          .catch(() => {});
      }
    },
    [user?.id, isLocalMode, lang]
  );

  return { favorites, toggle };
}