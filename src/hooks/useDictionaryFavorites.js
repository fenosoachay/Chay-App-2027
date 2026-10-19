import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Favoris du dictionnaire, synchronisés avec le compte utilisateur.
// Le localStorage reste le cache instantané (rendu immédiat) et la source
// hors ligne ; le serveur assure la persistance entre appareils. Les favoris
// déjà présents localement sont migrés une fois vers le serveur.
const KEY = "chay_dictionary_favorites";

function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeLocal(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : le favori reste valable pour la session */
  }
}
function normalize(mot) {
  return (mot || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function useDictionaryFavorites() {
  const { user, isLocalMode } = useAuth();
  const [favorites, setFavorites] = useState(readLocal);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (isLocalMode || !user?.id || !navigator.onLine) return undefined;
    let alive = true;
    (async () => {
      try {
        const page = await base44.entities.DictionaryFavorite.filter(
          {},
          { sort: "-mot", limit: 500 }
        );
        let serverRows = Array.isArray(page) ? page : page?.items || [];
        let serverMots = serverRows.map((r) => r.mot);
        // Migration unique : pousser les favoris locaux absents du serveur.
        const local = readLocal();
        const toCreate = local.filter((m) => !serverMots.includes(m));
        if (toCreate.length && !migratedRef.current) {
          migratedRef.current = true;
          await base44.entities.DictionaryFavorite.bulkCreate(
            toCreate.map((m) => ({ mot: m, mot_normalized: normalize(m) }))
          ).catch(() => {});
          const page2 = await base44.entities.DictionaryFavorite.filter(
            {},
            { sort: "-mot", limit: 500 }
          );
          serverRows = Array.isArray(page2) ? page2 : page2?.items || [];
          serverMots = serverRows.map((r) => r.mot);
        }
        if (!alive) return;
        const merged = Array.from(new Set([...serverMots, ...local]));
        writeLocal(merged);
        setFavorites(merged);
      } catch {
        /* garde le cache local */
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id, isLocalMode]);

  const toggle = useCallback(
    (mot) => {
      const wasFavorite = readLocal().includes(mot);
      setFavorites((prev) => {
        const next = prev.includes(mot)
          ? prev.filter((m) => m !== mot)
          : [...prev, mot];
        writeLocal(next);
        return next;
      });
      if (isLocalMode || !user?.id || !navigator.onLine) return;
      if (wasFavorite) {
        (async () => {
          try {
            const page = await base44.entities.DictionaryFavorite.filter(
              { mot },
              { limit: 1 }
            );
            const arr = Array.isArray(page) ? page : page?.items || [];
            if (arr[0]) await base44.entities.DictionaryFavorite.delete(arr[0].id);
          } catch {
            /* la réconciliation se fera au prochain chargement */
          }
        })();
      } else {
        base44.entities.DictionaryFavorite
          .create({ mot, mot_normalized: normalize(mot) })
          .catch(() => {});
      }
    },
    [user?.id, isLocalMode]
  );

  return { favorites, toggle };
}