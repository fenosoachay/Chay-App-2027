import { useEffect, useRef, useState } from "react";
import { saveLocalProgress, loadProgress, pushProgress } from "@/lib/readingProgress";
import { enqueue } from "@/lib/offlineQueue";

// Charge la progression enregistrée pour la version courante et mémorise
// automatiquement le chapitre + premier verset visible pendant la lecture.
export default function useReadingProgress({ versionId, bookId, chapter, ready, user, isLocalMode }) {
  const [saved, setSaved] = useState(null);
  const verseRef = useRef(1);
  const timer = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  // Progression connue au moment d'ouvrir cette version (affichée dans le bouton).
  useEffect(() => {
    let alive = true;
    loadProgress(versionId, isLocalMode ? null : user).then((p) => alive && setSaved(p));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, user?.id]);

  const persist = () => {
    const p = saveLocalProgress(versionId, { book: bookId, chapter, verse: verseRef.current });
    if (isLocalMode || !userRef.current?.id) return;
    if (!navigator.onLine) { enqueue("progress", { versionId, progress: p }); return; }
    pushProgress(versionId, p).catch(() => enqueue("progress", { versionId, progress: p }));
  };

  // Sauvegarde dès l'affichage d'un chapitre, puis suit le verset visible.
  useEffect(() => {
    if (!ready || !bookId || !chapter) return undefined;
    verseRef.current = 1;
    persist();
    const onScroll = () => {
      const els = document.querySelectorAll("[id^='verse-']");
      const top = Array.from(els).find((el) => el.getBoundingClientRect().bottom > 120);
      if (!top) return;
      verseRef.current = Number(top.id.replace("verse-", "")) || 1;
      clearTimeout(timer.current);
      timer.current = setTimeout(persist, 1500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, versionId, bookId, chapter]);

  return saved;
}