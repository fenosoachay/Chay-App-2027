import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  StickyNote,
  Highlighter,
  Copy,
  Link2,
  Undo2,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { HIGHLIGHT_COLORS, LANGUAGES, VERSIONS, highlightHex } from "@/lib/bibleConstants";
import { useTheme } from "@/hooks/useTheme";
import VerseActionsSheet from "@/components/bible/VerseActionsSheet";
import ReferencesSheet from "@/components/bible/ReferencesSheet";
import ReaderSearchBox from "@/components/bible/ReaderSearchBox";
import DrawerSelect from "@/components/DrawerSelect";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
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
const bookPickerLabel = (book) => ({
  ...book,
  displayName: book.id === "1TH" ? "1 Thess." : book.id === "2TH" ? "2 Thess." : book.name,
});
const normalizeBookSearch = (value) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

export default function BibleReader({ onBack }) {
  const { toast } = useToast();
  const { resolved: themeResolved } = useTheme();
  const isDarkMode = themeResolved === "dark";
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

  // Sheet (modal) du sélecteur de livres : grille de cases, comme les chapitres.
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [bookSearch, setBookSearch] = useState("");

  const [booksStatus, setBooksStatus] = useState("loading");
  const [chapterStatus, setChapterStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [annotations, setAnnotations] = useState({});
  const [selected, setSelected] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Références croisées (1.3.26) : fenêtre ouverte, et passage d'où l'on vient (bouton « Revenir à … »).
  const [refsOuvert, setRefsOuvert] = useState(false);
  const [retourRef, setRetourRef] = useState(null);
  // Saut vers un passage : le verset n'est visé qu'une fois SON chapitre chargé (sinon il viserait l'ancien).
  const [saut, setSaut] = useState(null);
  const [charge, setCharge] = useState(""); // « livre:chapitre » dont les versets sont affichés
  useEffect(() => {
    if (!saut || chapterStatus !== "ready" || charge !== `${saut.bookId}:${saut.chapter}`) return;
    setPendingVerse(saut.verse);
    setSaut(null);
  }, [saut, chapterStatus, charge]);
  // Sheet (modal) du sélecteur de chapitres : même pattern que le sélecteur de livre.
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);

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

  // Livres du catalogue, avec leur rang canonique (order 1..39 = Ancienne
  // Alliance, 40..66 = Nouvelle Alliance).
  const booksWithTestament = useMemo(
    () => books.map((b) => ({ ...b, testament: b.order <= 39 ? "OT" : "NT" })),
    [books]
  );
  const otBooks = useMemo(() => booksWithTestament.filter((b) => b.testament === "OT"), [booksWithTestament]);
  const ntBooks = useMemo(() => booksWithTestament.filter((b) => b.testament === "NT"), [booksWithTestament]);
  const filteredBookLists = useMemo(() => {
    const query = normalizeBookSearch(bookSearch.trim());
    const filterBooks = (list) => list
      .map(bookPickerLabel)
      .filter((book) =>
        !query ||
        normalizeBookSearch(book.name).includes(query) ||
        normalizeBookSearch(book.displayName).includes(query)
      );
    return [
      { label: "Ancienne Alliance", list: filterBooks(otBooks) },
      { label: "Nouvelle Alliance", list: filterBooks(ntBooks) },
    ];
  }, [bookSearch, ntBooks, otBooks]);
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
        setCharge(`${selectedBookId}:${selectedChapter}`);
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

      {/* Sur téléphone : bord à bord (pas de fond marron à gauche ni à droite). */}
      <section className="-mx-3 overflow-hidden border-y border-border bg-card shadow-sm md:mx-0 md:rounded-3xl md:border">
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
              {/* Sélecteur de livres : bouton trigger + sheet (modal) contenant
                  une grille de cases, comme le sélecteur de chapitres. */}
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={bookPickerOpen}
                onClick={() => setBookPickerOpen(true)}
                className="inline-flex flex-[2] min-w-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-bold transition hover:bg-muted"
              >
                <span className="flex-1 truncate text-left">{selectedBook?.name || "Livre"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground/50" />
              </button>

              <Drawer
                open={bookPickerOpen}
                onOpenChange={(open) => {
                  setBookPickerOpen(open);
                  if (!open) setBookSearch("");
                }}
              >
                <DrawerContent className="max-h-[85vh]">
                  <DrawerHeader className="text-left">
                    <DrawerTitle>Livre</DrawerTitle>
                    <DrawerDescription>
                      Ancienne Alliance ({otBooks.length}) · Nouvelle Alliance ({ntBooks.length})
                    </DrawerDescription>
                  </DrawerHeader>
                  <div className="px-4 pb-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={bookSearch}
                        onChange={(event) => setBookSearch(event.target.value)}
                        placeholder="Rechercher un livre…"
                        aria-label="Rechercher un livre de la Bible"
                        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto overscroll-contain px-4 pb-6 max-h-[60vh]">
                    {filteredBookLists.map(({ label, list }) => list.length > 0 && (
                      <div key={label} className="mb-4 last:mb-0">
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                          {label}
                        </h3>
                        <div
                          role="listbox"
                          aria-label={`Choisir un livre — ${label}`}
                          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                        >
                          {list.map((b) => {
                            const isActive = b.id === selectedBookId;
                            return (
                              <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => {
                                  setSelectedBookId(b.id);
                                  setSelectedChapter(1);
                                  setBookPickerOpen(false);
                                }}
                                className={`flex h-12 items-center justify-center rounded-sm px-1 text-center text-sm font-bold leading-tight transition ${
                                  isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "border border-border bg-card text-foreground/80 hover:bg-primary/10 hover:text-primary"
                                }`}
                              >
                                {b.displayName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {filteredBookLists.every(({ list }) => list.length === 0) && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Aucun livre ne correspond à cette recherche.
                      </p>
                    )}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>
          )}
        </div>

        {/* Sélecteur de chapitres : bouton trigger + sheet (modal) identique au
            sélecteur de livre, contenant une grille de carrés scrollables. */}
        {booksStatus === "ready" && (
          <div className="border-b border-border px-3 py-3 md:px-6">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={chapterPickerOpen}
              onClick={() => setChapterPickerOpen(true)}
              className="inline-flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-bold transition hover:bg-muted"
            >
              <span className="flex-1 truncate text-left">
                Chapitre {selectedChapter}
                <span className="ml-1 font-semibold text-muted-foreground/70">
                  · {selectedBook?.name} ({chapterNumbers.length})
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-foreground/50" />
            </button>

            <Drawer open={chapterPickerOpen} onOpenChange={setChapterPickerOpen}>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="text-left">
                  <DrawerTitle>Chapitre</DrawerTitle>
                  <DrawerDescription>
                    {selectedBook?.name} — {chapterNumbers.length} chapitre
                    {chapterNumbers.length > 1 ? "s" : ""}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto overscroll-contain px-4 pb-6 max-h-[60vh]">
                  <div
                    role="listbox"
                    aria-label="Choisir un chapitre"
                    className="grid grid-cols-5 justify-items-center gap-2 sm:grid-cols-6"
                  >
                    {chapterNumbers.map((c) => {
                      const isActive = c === selectedChapter;
                      return (
                        <button
                          key={c}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            setSelectedChapter(c);
                            setChapterPickerOpen(false);
                          }}
                          className={`flex h-11 w-11 items-center justify-center rounded-sm text-sm font-bold tabular-nums transition ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "border border-border bg-card text-foreground/80 hover:bg-primary/10 hover:text-primary"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        )}

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
              <div className="selectable space-y-3 text-[1.25rem] leading-[1.6] text-foreground/80">
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
                      <span className={`rounded px-0.5 ${isSelected ? "bg-primary/20 ring-1 ring-primary/40" : ""}`} style={!isSelected && hl ? { backgroundColor: highlightHex(hl, isDarkMode) } : undefined}>
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

      <ReferencesSheet
        open={refsOuvert} onOpenChange={setRefsOuvert} lang={lang} books={books} livre={selectedBook}
        chapitre={selectedChapter} versets={selectedVerses.map((v) => v.number)}
        onOuvrir={(r) => {
          const cible = books.find((b) => b.order === r.b);
          if (!cible) return;
          const v0 = selectedVerses[0]?.number || 1;
          setRetourRef({ bookId: selectedBookId, chapter: selectedChapter, verse: v0, label: `${selectedBook?.name || ""} ${selectedChapter}:${v0}` });
          setRefsOuvert(false);
          setSelected([]);
          setSelectedBookId(cible.id);
          setSelectedChapter(r.c);
          setSaut({ bookId: cible.id, chapter: r.c, verse: r.v });
        }}
      />

      {retourRef && selected.length === 0 && (
        <div className="fixed left-0 right-0 z-30 flex justify-center px-4 bottom-[88px] md:bottom-6">
          <button
            type="button"
            onClick={() => {
              const r = retourRef;
              setRetourRef(null);
              setSelectedBookId(r.bookId);
              setSelectedChapter(r.chapter);
              setSaut({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur-xl"
          >
            <Undo2 className="h-4 w-4 text-primary" /> Revenir à {retourRef.label}
          </button>
        </div>
      )}

      <VerseActionsSheet
        open={sheetOpen} onOpenChange={setSheetOpen} verses={selectedVerses} annotations={annotations}
        onHighlight={onHighlight} onNote={onNote} onRemove={onRemove}
      />

      {selected.length > 0 && (
        <div className="fixed left-0 right-0 z-30 px-4 bottom-[88px] md:bottom-6">
          <div className="mx-auto max-w-md flex items-center justify-center gap-1.5 rounded-[1.5rem] border border-border bg-background/95 backdrop-blur-xl shadow-lg px-2 py-2.5">
            <button disabled={isLocalMode} title={isLocalMode ? 'Connexion requise' : undefined} onClick={() => setSheetOpen(true)} className="disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1 px-3 py-2 rounded-2xl brand-gradient text-white shadow-sm hover:scale-105 transition">
              <Highlighter className="h-5 w-5" /><span className="text-[0.6875rem] font-bold">{isLocalMode ? 'Connexion requise' : 'Surligner'}</span>
            </button>
            <button onClick={() => setRefsOuvert(true)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <Link2 className="h-5 w-5 text-primary" /><span className="text-[0.6875rem] font-bold">Références</span>
            </button>
            <button onClick={copySelected} className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <Copy className="h-5 w-5 text-primary" /><span className="text-[0.6875rem] font-bold">Copier</span>
            </button>
            <button disabled={isLocalMode} title={isLocalMode ? 'Connexion requise' : undefined} onClick={() => setSheetOpen(true)} className="disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <StickyNote className="h-5 w-5 text-primary" /><span className="text-[0.6875rem] font-bold">{isLocalMode ? 'Connexion requise' : 'Notes'}</span>
            </button>
            <button onClick={() => setSelected([])} className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl border border-border hover:bg-muted transition">
              <X className="h-5 w-5 text-foreground/60" /><span className="text-[0.6875rem] font-bold">Annuler</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
