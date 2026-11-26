import { useEffect, useRef, useState } from "react";
import { saveLocalProgress, loadProgress, pushProgress } from "@/lib/readingProgress";
import { enqueue } from "@/lib/offlineQueue";

// Charge la progression enregistrée pour la version courante et mémorise
// automatiquement le chapitre + premier verset visible pendant la lecture.
// memoriserOuverture = false (ouverture par un lien, ex. « Lire la Bible » du verset du jour) : ce premier passage
// n'est mémorisé que si on y lit vraiment (défilement) ; la dernière lecture n'est plus écrasée (1.3.41).
export default function useReadingProgress({ versionId, bookId, chapter, ready, user, isLocalMode, memoriserOuverture = true }) {
  const [saved, setSaved] = useState(null);
  const premier = useRef(true);
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
    // Passage ouvert par un lien : mémorisé seulement si la personne le lit elle-même (doigt, molette, clavier),
    // pas à cause du défilement automatique vers le verset.
    const attendreGeste = premier.current && !memoriserOuverture;
    premier.current = false;
    let geste = false;
    const surGeste = () => { geste = true; };
    const GESTES = ["touchstart", "wheel", "keydown", "pointerdown"];
    if (attendreGeste) GESTES.forEach((g) => window.addEventListener(g, surGeste, { passive: true }));
    else persist();
    const onScroll = () => {
      if (attendreGeste && !geste) return;
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
      GESTES.forEach((g) => window.removeEventListener(g, surGeste));
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, versionId, bookId, chapter]);

  return saved;
}