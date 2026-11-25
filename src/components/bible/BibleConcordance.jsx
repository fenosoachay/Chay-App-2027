import React, { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Star, X } from "lucide-react";
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
import { BarreNuit, CadreNuit, ChampNuit, FilNuit, LISERE, OR, TitreNuit } from "@/components/bible/NuitDoree";
import AlphabetGrid from "@/components/bible/concordance/AlphabetGrid";
import WordList from "@/components/bible/concordance/WordList";
import BookGroupList from "@/components/bible/concordance/BookGroupList";
import BookVerseList from "@/components/bible/concordance/BookVerseList";

// Bloc 3 — Concordance, en étapes :
//   Accueil (alphabet) → Lettre (liste de mots) → Mot (versets groupés par
//   livre) → Livre (versets du livre, mot surligné).
// Tout est calculé sur l'index inversé local : fonctionne hors ligne.
export default function BibleConcordance({ onBack, onOpenVerse }) {
  const [lang, setLang] = useState(() => {
    const l = new URLSearchParams(window.location.search).get("lang");
    return l === "fr" || l === "mg" ? l : "fr";
  });
  const [letter, setLetter] = useState(null);
  const [word, setWord] = useState(
    () => new URLSearchParams(window.location.search).get("word") || null
  );
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
    // 1.3.34 : habillage « Nuit dorée » de Chay Game.
    <CadreNuit>
      <BarreNuit
        onBack={back}
        droite={(
          <button
            type="button"
            onClick={() => {
              setShowFavorites((s) => !s);
              setWord(null);
              setBook(null);
            }}
            aria-label="Mes favoris"
            aria-pressed={showFavorites}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <Star className="h-6 w-6" style={{ color: OR, fill: showFavorites ? OR : "transparent" }} />
          </button>
        )}
      >
        {showSearch ? (
          <div className="relative">
            <ChampNuit
              icone={Search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowFavorites(false);
              }}
              placeholder={lang === "fr" ? "Rechercher un mot…" : "Hitady teny…"}
              aria-label="Mot à rechercher dans la concordance"
              maxLength={100}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer"
                className="absolute right-0 top-1/2 -translate-y-1/2 text-white/50"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        ) : (
          <TitreNuit>{word}</TitreNuit>
        )}
      </BarreNuit>

      <FilNuit
        crumbs={crumbs}
        droite={(
          <div className="flex shrink-0 overflow-hidden rounded-full border" style={{ borderColor: LISERE }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => changeLang(l.id)}
                aria-pressed={lang === l.id}
                className={`px-3 py-1 text-[0.6875rem] font-bold ${lang === l.id ? "text-[#1a1030]" : "text-white/70 hover:bg-white/10"}`}
                style={lang === l.id ? { background: "linear-gradient(100deg, #FFD66E, #C9A052)" } : undefined}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      />

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
    </CadreNuit>
  );
}
