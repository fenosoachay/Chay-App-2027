import React, { useMemo, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Search, Star, X } from "lucide-react";
import useConcordanceIndex from "@/hooks/useConcordanceIndex";
import useConcordanceFavorites from "@/hooks/useConcordanceFavorites";
import { LANGUAGES } from "@/lib/bibleConstants";
import {
  getWordsByLetter,
  letterCounts,
  groupWordByBook,
  versesOfBook,
  letterOf,
} from "@/lib/concordanceBrowse";
import { wordToIndexKeys } from "@/lib/bibleConcordance";
import ConcordanceBreadcrumb from "@/components/bible/concordance/ConcordanceBreadcrumb";
import AlphabetGrid from "@/components/bible/concordance/AlphabetGrid";
import WordList from "@/components/bible/concordance/WordList";
import BookGroupList from "@/components/bible/concordance/BookGroupList";
import BookVerseList from "@/components/bible/concordance/BookVerseList";

// Bloc 3 — Concordance, en étapes :
//   Accueil (alphabet) → Lettre (liste de mots) → Mot (versets groupés par
//   livre) → Livre (versets du livre, mot surligné).
// Tout est calculé sur l'index inversé local : fonctionne hors ligne.
export default function BibleConcordance({ onBack, onOpenVerse }) {
  const [lang, setLang] = useState("fr");
  const [letter, setLetter] = useState(null);
  const [word, setWord] = useState(null);
  const [book, setBook] = useState(null); // { bookIdx, name }
  const [query, setQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);

  const { index, status, error, retry } = useConcordanceIndex(lang);
  const { favorites, toggle } = useConcordanceFavorites(lang);

  const goHome = () => {
    setLetter(null);
    setWord(null);
    setBook(null);
    setQuery("");
    setShowFavorites(false);
  };
  const goLetter = (l) => {
    setLetter(l);
    setWord(null);
    setBook(null);
    setQuery("");
    setShowFavorites(false);
  };
  const goWord = (w) => {
    setWord(w);
    setLetter((l) => l || letterOf(w));
    setBook(null);
    setQuery("");
    setShowFavorites(false);
  };

  // Bouton retour : un cran en arrière, puis sortie du module à l'accueil.
  const back = () => {
    if (book) setBook(null);
    else if (word) setWord(null);
    else if (letter || showFavorites || query) goHome();
    else onBack();
  };

  const changeLang = (l) => {
    setLang(l);
    goHome();
  };

  const byLetter = useMemo(() => (index ? getWordsByLetter(index) : {}), [index]);
  const counts = useMemo(() => (index ? letterCounts(index) : {}), [index]);

  // Liste affichée à l'étape « lettre » : filtrée par la barre de recherche
  // (insensible à la casse et aux accents en français), ou favoris.
  const listed = useMemo(() => {
    if (!index) return [];
    const q = query.trim();
    if (showFavorites) {
      const all = Object.values(byLetter).flat();
      return all.filter((w) => favorites.includes(w.word));
    }
    if (q) {
      const forms = wordToIndexKeys(q, lang);
      const pool = letter ? byLetter[letter] || [] : Object.values(byLetter).flat();
      return pool.filter((w) => {
        const wf = wordToIndexKeys(w.word, lang);
        return wf.some((f) => forms.some((qf) => f.startsWith(qf)));
      });
    }
    return letter ? byLetter[letter] || [] : [];
  }, [index, byLetter, letter, query, showFavorites, favorites, lang]);

  const groups = useMemo(
    () => (index && word ? groupWordByBook(index, word) : null),
    [index, word]
  );
  const verses = useMemo(
    () => (index && word && book ? versesOfBook(index, word, book.bookIdx) : []),
    [index, word, book]
  );

  const crumbs = [{ label: "Accueil", onClick: goHome }];
  if (showFavorites) crumbs.push({ label: "Favoris", onClick: () => setShowFavorites(true) });
  if (letter && !showFavorites) crumbs.push({ label: letter, onClick: () => goLetter(letter) });
  if (word) crumbs.push({ label: word, onClick: () => setBook(null) });
  if (book) crumbs.push({ label: book.name });

  const showList = !word && (letter || query.trim() || showFavorites);
  const showSearch = !word;

  return (
    <main className="mx-auto min-h-[80vh] max-w-3xl bg-black text-white md:my-6 md:overflow-hidden md:rounded-3xl">
      <div className="flex items-center gap-2 bg-zinc-800 px-3 py-3">
        <button onClick={back} aria-label="Retour" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10">
          <ArrowLeft className="h-6 w-6" />
        </button>
        {showSearch ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowFavorites(false);
              }}
              placeholder={lang === "fr" ? "Rechercher un mot…" : "Hitady teny…"}
              aria-label="Mot à rechercher dans la concordance"
              maxLength={100}
              className="w-full border-b border-slate-500 bg-transparent py-1.5 pl-9 pr-8 text-base text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Effacer"
                className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-lg text-slate-300">{word}</h1>
        )}
        <button
          onClick={() => {
            setShowFavorites((s) => !s);
            setWord(null);
            setBook(null);
          }}
          aria-label="Mes favoris"
          aria-pressed={showFavorites}
          className="rounded-lg p-1.5 hover:bg-white/10"
        >
          <Star className={`h-6 w-6 ${showFavorites ? "fill-slate-300 text-slate-300" : "text-slate-400"}`} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pr-3">
        <ConcordanceBreadcrumb crumbs={crumbs} />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-zinc-700">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => changeLang(l.id)}
              aria-pressed={lang === l.id}
              className={`px-2.5 py-1 text-[11px] font-bold ${
                lang === l.id ? "brand-gradient text-white" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Préparation de l'index…
        </p>
      )}
      {status === "error" && (
        <div className="flex items-center justify-between gap-3 px-4 py-6">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={retry} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            <RefreshCw className="h-3.5 w-3.5" /> Réessayer
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          {!word && !showList && <AlphabetGrid counts={counts} onPick={goLetter} />}
          {showList && (
            <WordList
              words={listed}
              favorites={favorites}
              onToggleFavorite={toggle}
              onPick={goWord}
              empty={showFavorites ? "Aucun mot favori pour le moment." : "Aucun mot trouvé."}
            />
          )}
          {word && !book && groups && (
            <BookGroupList word={word} groups={groups} onPick={(b) => setBook(b)} />
          )}
          {word && book && (
            <BookVerseList
              verses={verses}
              bookName={book.name}
              word={word}
              lang={lang}
              onOpen={(v) =>
                onOpenVerse(lang, { bookId: index.books[v.bookIdx]?.id, chapter: v.chapter, verse: v.verse })
              }
            />
          )}
        </>
      )}
    </main>
  );
}