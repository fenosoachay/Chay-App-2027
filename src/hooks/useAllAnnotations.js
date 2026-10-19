import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { VERSIONS } from "@/lib/bibleConstants";

const ALL_VERSIONS = Object.values(VERSIONS).flat();
const langOfVersion = (vid) =>
  ALL_VERSIONS.find((v) => v.id === vid)?.lang || "fr";

// Charge toutes les annotations (surlignages + notes) de l'utilisateur
// connecté, ainsi que le catalogue des livres et le texte des versets
// concernés (lus depuis les fichiers bibliques locaux).
export default function useAllAnnotations() {
  const { user, isLocalMode } = useAuth();
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookCatalog, setBookCatalog] = useState({ fr: {}, mg: {} });
  const verseCacheRef = useRef({});
  const [, setVerseTick] = useState(0);

  const load = useCallback(async () => {
    if (isLocalMode || !user?.id) {
      setAnnotations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const page = await base44.entities.BibleAnnotation.filter(
        {},
        { sort: "-created_date", limit: 500 }
      );
      const list = Array.isArray(page) ? page : page?.items || [];
      setAnnotations(list);

      const catalogs = { fr: {}, mg: {} };
      for (const l of ["fr", "mg"]) {
        try {
          const books = await getLocalBooks(l);
          books.forEach((b) => {
            catalogs[l][b.id] = b.name;
          });
        } catch {
          /* ignore */
        }
      }
      setBookCatalog(catalogs);

      // Pré-charge le texte des versets pour chaque chapitre référencé
      // (dédupliqué par chapitre — les fichiers bibliques sont locaux).
      const chapters = new Set();
      list.forEach((a) =>
        chapters.add(`${langOfVersion(a.translation_id)}|${a.book_id}|${a.chapter}`)
      );
      await Promise.all(
        [...chapters].map(async (k) => {
          const [l, b, c] = k.split("|");
          try {
            verseCacheRef.current[k] = await getLocalChapterVerses(l, b, Number(c));
          } catch {
            verseCacheRef.current[k] = [];
          }
        })
      );
      setVerseTick((t) => t + 1);
    } catch (e) {
      setError(e.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [user?.id, isLocalMode]);

  useEffect(() => {
    load();
  }, [load]);

  const bookName = useCallback(
    (translationId, bookId) =>
      bookCatalog[langOfVersion(translationId)]?.[bookId] || bookId,
    [bookCatalog]
  );

  const verseText = useCallback(
    (translationId, bookId, chapter, verse) => {
      const lang = langOfVersion(translationId);
      const verses = verseCacheRef.current[`${lang}|${bookId}|${chapter}`];
      if (!verses) return "";
      return verses.find((v) => v.number === verse)?.text || "";
    },
    []
  );

  const removeAnnotation = useCallback(async (id) => {
    await base44.entities.BibleAnnotation.delete(id).catch(() => {});
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateAnnotation = useCallback(async (id, data) => {
    await base44.entities.BibleAnnotation.update(id, data).catch(() => {});
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...data } : a))
    );
  }, []);

  return {
    annotations,
    loading,
    error,
    reload: load,
    bookName,
    verseText,
    removeAnnotation,
    updateAnnotation,
  };
}