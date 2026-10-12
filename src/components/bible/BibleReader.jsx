import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  StickyNote,
  Highlighter,
  Copy,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { HIGHLIGHT_COLORS, LANGUAGES, VERSIONS } from "@/lib/bibleConstants";
import VerseActionsSheet from "@/components/bible/VerseActionsSheet";
import ReaderSearchBox from "@/components/bible/ReaderSearchBox";
import DrawerSelect from "@/components/DrawerSelect";
import { enqueue, queueSize } from "@/lib/offlineQueue";
import useReadingProgress from "@/hooks/useReadingProgress";
import ResumeReadingButton from "@/components/bible/ResumeReadingButton";
import { readLocalAnnotations, saveLocalAnnotation, clearLocalAnnotations } from "@/lib/localAnnotations";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { parseReference } from "@/lib/bibleBookRefs";

// Les textes (FR et MG) viennent exclusivement des fichiers locaux
// public/data/bibles : aucune API distante, lecture possible hors ligne.
const ALL_VERSIONS = Object.values(VERSIONS).flat();
const langOfVersion = (versionId) => ALL_VERSIONS.find((v) => v.id === versionId)?.lang || "fr";

export default function BibleReader({ onBack }) {
  const { toast } = useToast();
  const { user, isLocalMode } = useAuth();
  const didInitRef = useRef(false);
  // Langue et version initiales : ?translation=… (lien depuis la concordance).
  const initialVersion = (() => {
    const t = new URLSearchParams(window.location.search).get("translation");
    return ALL_VERSIONS.some((v) => v.id === t) ? t : "fra_lsg";
  })();
  const [lang, setLang] = useState(langOfVersion(initialVersion));
  const [selectedVersion, setSelectedVersion] = useState(initialVersion);
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState("JHN");
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [verses, setVerses] = useState([]);
  const [pendingRef, setPendingRef] = useState(() =>
    new URLSearchParams(window.location.search).get("ref")
  );
  const [pendingVerse, setPendingVerse] = useState(() => {
    const v = new URLSearchParams(window.location.search).get("verse");
    return v ? Number(v) : null;
  });
  const [highlightVerse, setHighlightVerse] = useState(null);

  const [booksStatus, setBooksStatus] = useState("loading");
  const [chapterStatus, setChapterStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [annotations, setAnnotations] = useState({});
  const [selected, setSelected] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Catalogue des 66 livres de la langue choisie, lu depuis le fichier local.
  // Les ids de livres sont identiques en FR et MG (GEN, EXO… REV) : le livre
  // et le chapitre en cours sont donc conservés lors d'un changement de langue.
  useEffect(() => {
    let alive = true;
    const resolveInitial = (loaded) => {
      let nextBookId = loaded.find((b) => b.id === selectedBookId)?.id || loaded.find((b) => b.id === "JHN")?.id || loaded[0].id;
      let nextChapter = didInitRef.current ? selectedChapter : 1;
      if (pendingRef) {
        const parsed = parseReference(pendingRef, loaded);
        if (parsed) {
          nextBookId = parsed.bookId;
          nextChapter = parsed.chapter;
          if (parsed.verse) setPendingVerse(parsed.verse);
        }
        setPendingRef(null);
      }
      const maxChapter = loaded.find((b) => b.id === nextBookId)?.numberOfChapters || 1;
      didInitRef.current = true;
      return { nextBookId, nextChapter: Math.min(Math.max(nextChapter, 1), maxChapter) };
    };

    async function loadBooks() {
      setBooksStatus("loading");
      setErrorMessage("");
      try {
        const loaded = await getLocalBooks(lang);
        if (!alive) return;
        const { nextBookId, nextChapter } = resolveInitial(loaded);
        setBooks(loaded);
        setSelectedBookId(nextBookId);
        setSelectedChapter(nextChapter);
        setBooksStatus("ready");
      } catch (e) {
        if (!alive) return;
        setBooksStatus("error");
        setErrorMessage(e.message || "Lecture du fichier biblique impossible.");
      }
    }
    loadBooks();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const selectedBook = useMemo(() => books.find((b) => b.id === selectedBookId) || null, [books, selectedBookId]);
  const chapterNumbers = useMemo(() => {
    const count = selectedBook?.numberOfChapters || 1;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [selectedBook]);

  useEffect(() => {
    if (booksStatus !== "ready" || !selectedBookId || !selectedChapter) return;
    // Livre présent dans le catalogue mais sans aucun texte dans le fichier
    // source : on le signale au lieu de tenter une lecture.
    if (selectedBook && selectedBook.numberOfChapters === 0) {
      setVerses([]);
      setChapterStatus("missing");
      return;
    }
    let alive = true;
    async function loadChapter() {
      setChapterStatus("loading");
      setVerses([]);
      setErrorMessage("");
      try {
        // Texte lu depuis le fichier biblique local (aucune requête API).
        const loaded = await getLocalChapterVerses(lang, selectedBookId, selectedChapter);
        if (!alive) return;
        if (loaded.length === 0) throw new Error("Aucun verset trouvé pour ce chapitre.");
        setVerses(loaded);
        setChapterStatus("ready");
      } catch (e) {
        if (!alive) return;
        setChapterStatus("error");
        setErrorMessage(e.message || "Lecture du texte biblique impossible.");
      }
    }
    loadChapter();
    loadAnnotations();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booksStatus, lang, selectedVersion, selectedBookId, selectedChapter, selectedBook]);

  const savedProgress = useReadingProgress({
    versionId: selectedVersion, bookId: selectedBookId, chapter: selectedChapter,
    ready: chapterStatus === "ready", user, isLocalMode,
  });
  const resumeBook = savedProgress && books.find((b) => b.id === savedProgress.book);
  const isAlreadyThere = savedProgress && savedProgress.book === selectedBookId && savedProgress.chapter === selectedChapter;
  const resumeReading = () => {
    setSelectedBookId(savedProgress.book);
    setSelectedChapter(savedProgress.chapter);
    setPendingVerse(savedProgress.verse > 1 ? savedProgress.verse : null);
  };

  // Surligne temporairement le verset ciblé après navigation depuis la recherche.
  useEffect(() => {
    if (chapterStatus !== "ready" || pendingVerse == null) return;
    const v = pendingVerse;
    setPendingVerse(null);
    setHighlightVerse(v);
    const el = document.getElementById(`verse-${v}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightVerse(null), 3500);
    return () => clearTimeout(t);
  }, [chapterStatus, pendingVerse]);

  const loadAnnotations = async () => {
    if (isLocalMode || !user?.id) { setAnnotations({}); return; }
    if (!selectedVersion || !selectedBookId || !selectedChapter) return;
    const local = readLocalAnnotations(selectedVersion, selectedBookId, selectedChapter);
    if (!navigator.onLine) { setAnnotations(local); return; }
    const anns = await base44.entities.BibleAnnotation.filter(
      { translation_id: selectedVersion, book_id: selectedBookId, chapter: selectedChapter },
      "-verse", 200
    ).catch(() => []);
    const map = {};
    (Array.isArray(anns) ? anns : []).forEach((a) => { map[a.verse] = a; });
    // Tant que des actions attendent l'envoi, on garde la copie locale par-dessus.
    if (queueSize() > 0) Object.keys(local).forEach((v) => { map[v] = { ...(map[v] || {}), ...local[v] }; });
    else clearLocalAnnotations(selectedVersion, selectedBookId, selectedChapter);
    setAnnotations(map);
  };

  const toggleVerse = (n) => setSelected((prev) => prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]);
  const selectedVerses = selected.map((n) => verses.find((v) => v.number === n)).filter(Boolean).sort((a, b) => a.number - b.number);

  const copySelected = async () => {
    if (selectedVerses.length === 0) return;
    try {
      await navigator.clipboard.writeText(selectedVerses.map((v) => `${v.number}. ${v.text}`).join("\n"));
      toast({ title: `${selectedVerses.length} verset(s) copié(s)` });
    } catch { toast({ title: "Copie impossible" }); }
  };

  const upsertMany = async (data) => {
    if (isLocalMode || !user?.id) { toast({ title: 'Connexion requise' }); return; }
    if (selectedVerses.length === 0) return;
    if (!navigator.onLine) {
      selectedVerses.forEach((v) => {
        saveLocalAnnotation(selectedVersion, selectedBookId, selectedChapter, v.number, data);
        enqueue("annotation", { translation_id: selectedVersion, book_id: selectedBookId, chapter: selectedChapter, verse: v.number, data });
      });
      await loadAnnotations();
      setSelected([]);
      setSheetOpen(false);
      toast({ title: "Enregistré sur l'appareil", description: "Envoi automatique au retour de la connexion." });
      return;
    }
    try {
      await Promise.all(selectedVerses.map(async (v) => {
        const existing = annotations[v.number];
        if (existing) await base44.entities.BibleAnnotation.update(existing.id, data);
        else await base44.entities.BibleAnnotation.create({
          translation_id: selectedVersion, book_id: selectedBookId, chapter: selectedChapter, verse: v.number,
          highlight_color: null, note: null, ...data,
        });
      }));
      await loadAnnotations();
      setSelected([]);
      setSheetOpen(false);
    } catch (e) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
  };
  const onHighlight = (colorId) => upsertMany({ highlight_color: colorId });
  const onNote = async (text) => {
    await upsertMany({ note: text.trim() || null });
    toast({ title: "Note enregistrée" });
  };
  const onRemove = async () => upsertMany({ highlight_color: null });

  useEffect(() => { setSelected([]); setSheetOpen(false); }, [selectedVersion, selectedBookId, selectedChapter]);

  function handleLangChange(newLang) {
    setLang(newLang);
    setSelectedVersion(VERSIONS[newLang][0].id);
  }

  function goToPreviousChapter() {
    if (selectedChapter > 1) { setSelectedChapter((v) => v - 1); return; }
    const idx = books.findIndex((b) => b.id === selectedBookId);
    if (idx > 0) { setSelectedBookId(books[idx - 1].id); setSelectedChapter(books[idx - 1].numberOfChapters); }
  }
  function goToNextChapter() {
    const total = selectedBook?.numberOfChapters || 1;
    if (selectedChapter < total) { setSelectedChapter((v) => v + 1); return; }
    const idx = books.findIndex((b) => b.id === selectedBookId);
    if (idx < books.length - 1) { setSelectedBookId(books[idx + 1].id); setSelectedChapter(1); }
  }

  const currentBookIndex = books.findIndex((b) => b.id === selectedBookId);
  const isFirstChapter = currentBookIndex === 0 && selectedChapter === 1;
  const isLastChapter = currentBookIndex === books.length - 1 && selectedChapter === selectedBook?.numberOfChapters;

  // Ouvre un résultat de recherche dans le lecteur, sur le bon chapitre, et
  // surligne temporairement le verset.
  function openSearchResult({ bookId, chapter, verse }) {
    if (!bookId) return;
    setSelectedBookId(bookId);
    setSelectedChapter(chapter);
    setPendingVerse(verse ?? null);
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-4 md:px-8 md:py-10">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10">
          <ChevronLeft className="h-5 w-5" /> Retour
        </button>
      </div>

      <header className="mb-4 flex items-center gap-2.5">
        <div className="rounded-xl bg-primary/10 p-2">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">La Bible</h1>
          <p className="text-xs text-muted-foreground">
            {VERSIONS[lang].find((v) => v.id === selectedVersion)?.label}
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/50 px-3 py-3 md:px-6">
          {booksStatus === "loading" && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Chargement des livres…
            </div>
          )}
          {booksStatus === "error" && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </button>
            </div>
          )}
          {booksStatus === "ready" && (
            <div className="flex flex-nowrap gap-2">
              <DrawerSelect
                value={lang}
                onChange={(v) => handleLangChange(v)}
                title="Langue"
                triggerClassName="flex-1 min-w-0 px-3 py-2 text-xs gap-1.5"
                options={LANGUAGES.map((l) => ({ label: l.label, value: l.id }))}
              />
              <DrawerSelect
                value={selectedBookId}
                onChange={(v) => { setSelectedBookId(v); setSelectedChapter(1); }}
                title="Livre"
                searchable
                triggerClassName="flex-[2] min-w-0 px-3 py-2 text-xs gap-1.5"
                options={books.map((b) => ({ label: b.name, value: b.id }))}
              />
              <DrawerSelect
                value={selectedChapter}
                onChange={(v) => setSelectedChapter(Number(v))}
                title="Chapitre"
                triggerClassName="flex-1 min-w-0 px-3 py-2 text-xs gap-1.5"
                options={chapterNumbers.map((c) => ({ label: String(c), value: c }))}
              />
            </div>
          )}
        </div>

        {booksStatus === "ready" && resumeBook && !isAlreadyThere && (
          <ResumeReadingButton
            bookName={resumeBook.name} chapter={savedProgress.chapter} verse={savedProgress.verse}
            onResume={resumeReading}
          />
        )}

        {booksStatus === "ready" && (
          <ReaderSearchBox lang={lang} onSelect={openSearchResult} />
        )}

        {booksStatus === "ready" && (
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">{selectedBook?.name} {selectedChapter}</h2>
              </div>
              {chapterStatus === "loading" && (
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chargement</span>
              )}
            </div>
          </div>
        )}

        <div className="min-h-[52vh] px-4 py-5 md:px-10 md:py-9">
          {chapterStatus === "loading" && (
            <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Chargement du chapitre…</p>
            </div>
          )}
          {chapterStatus === "missing" && (
            <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-center">
              <AlertTriangle className="h-9 w-9 text-primary" />
              <div>
                <p className="font-bold text-foreground/80">
                  Le texte de « {selectedBook?.name} » est absent du fichier biblique fourni.
                </p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Ce livre sera disponible dès que le fichier biblique sera complété.
                </p>
              </div>
            </div>
          )}
          {chapterStatus === "error" && (
            <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 text-center">
              <AlertTriangle className="h-9 w-9 text-primary" />
              <div>
                <p className="font-bold text-foreground/80">Impossible de charger ce chapitre.</p>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </button>
            </div>
          )}
          {chapterStatus === "ready" && (
            <article className="mx-auto max-w-3xl">
              <div className="selectable space-y-3 text-sm md:text-[1.04rem] leading-6 md:leading-8 text-foreground/80">
                {verses.map((verse) => {
                  const ann = annotations[verse.number];
                  const hl = ann?.highlight_color ? HIGHLIGHT_COLORS.find((c) => c.id === ann.highlight_color) : null;
                  const isSelected = selected.includes(verse.number);
                  const isHighlighted = highlightVerse === verse.number;
                  return (
                    <p
                      key={verse.number}
                      id={`verse-${verse.number}`}
                      onClick={() => toggleVerse(verse.number)}
                      className={`cursor-pointer rounded px-0.5 transition hover:bg-muted ${isHighlighted ? "bg-primary/25 ring-1 ring-primary/50" : ""} ${isSelected ? "bg-primary/10" : ""}`}
                    >
                      <sup className="mr-1.5 text-xs font-bold text-primary">{verse.number}</sup>
                      <span className={`rounded px-0.5 ${isSelected ? "bg-primary/20 ring-1 ring-primary/40" : hl ? hl.verse : ""}`}>
                        {verse.text}
                      </span>
                      {ann?.note && <StickyNote className="inline h-3.5 w-3.5 text-primary ml-1 align-middle" />}
                    </p>
                  );
                })}
              </div>

              <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
                <button onClick={goToPreviousChapter} disabled={isFirstChapter} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30">
                  <ChevronLeft className="h-5 w-5" /> Précédent
                </button>
                <button onClick={goToNextChapter} disabled={isLastChapter} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30">
                  Suivant <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </article>
          )}
        </div>
      </section>

      <VerseActionsSheet
        open={sheetOpen} onOpenChange={setSheetOpen} verses={selectedVerses} annotations={annotations}
        onHighlight={onHighlight} onNote={onNote} onRemove={onRemove}
      />

      {selected.length > 0 && (
        <div className="fixed left-0 right-0 z-30 px-4 bottom-[88px] md:bottom-6">
          <div className="mx-auto max-w-sm flex items-center justify-center gap-2 rounded-[1.5rem] border border-border bg-background/95 backdrop-blur-xl shadow-lg px-3 py-2.5">
            <button disabled={isLocalMode} title={isLocalMode ? 'Connexion requise' : undefined} onClick={() => setSheetOpen(true)} className="disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1 px-4 py-2 rounded-2xl brand-gradient text-white shadow-sm hover:scale-105 transition">
              <Highlighter className="h-5 w-5" /><span className="text-[11px] font-bold">{isLocalMode ? 'Connexion requise' : 'Surligner'}</span>
            </button>
            <button onClick={copySelected} className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <Copy className="h-5 w-5 text-primary" /><span className="text-[11px] font-bold">Copier</span>
            </button>
            <button disabled={isLocalMode} title={isLocalMode ? 'Connexion requise' : undefined} onClick={() => setSheetOpen(true)} className="disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1 px-4 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <StickyNote className="h-5 w-5 text-primary" /><span className="text-[11px] font-bold">{isLocalMode ? 'Connexion requise' : 'Notes'}</span>
            </button>
            <button onClick={() => setSelected([])} className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <X className="h-5 w-5 text-foreground/60" /><span className="text-[11px] font-bold">Annuler</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}