import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Star } from "lucide-react";
import useDictionaryDb from "@/hooks/useDictionaryDb";
import useDictionaryFavorites from "@/hooks/useDictionaryFavorites";
import { getLetters, getWordsByLetter } from "@/lib/dictionaryDb";
import ConcordanceBreadcrumb from "@/components/bible/concordance/ConcordanceBreadcrumb";
import DictionaryLetterGrid from "@/components/bible/dictionary/DictionaryLetterGrid";
import DictionaryWordList from "@/components/bible/dictionary/DictionaryWordList";
import DictionaryDefinition from "@/components/bible/dictionary/DictionaryDefinition";
import DictionarySearchBox from "@/components/bible/dictionary/DictionarySearchBox";
import DictionaryLoading from "@/components/bible/dictionary/DictionaryLoading";

// Bloc 2 — Dictionnaire biblique Westphal (SQLite local, hors ligne) :
//   Alphabet → Lettre (liste de mots) → Mot (définition).
export default function BibleDictionary({ onBack }) {
  const { db, status, error, progress, retry } = useDictionaryDb();
  const { favorites, toggle } = useDictionaryFavorites();

  const [letter, setLetter] = useState(null);
  const [mot, setMot] = useState(null);
  const [query, setQuery] = useState("");
  // Lien direct depuis l'accueil : /bible?view=dictionary&favorites=1
  const [showFavorites, setShowFavorites] = useState(
    () => new URLSearchParams(window.location.search).get("favorites") === "1"
  );

  const goHome = () => {
    setLetter(null);
    setMot(null);
    setQuery("");
    setShowFavorites(false);
  };
  const goLetter = (l) => {
    setLetter(l);
    setMot(null);
    setQuery("");
    setShowFavorites(false);
  };
  const goWord = (m) => {
    setMot(m);
    setQuery("");
  };

  // Retour : un cran en arrière, puis sortie du module.
  const back = () => {
    if (mot) setMot(null);
    else if (letter || showFavorites || query) goHome();
    else onBack();
  };

  const letters = useMemo(() => (db ? getLetters(db) : []), [db]);
  const words = useMemo(() => {
    if (!db) return [];
    if (showFavorites) {
      return favorites
        .map((m) => ({ mot: m }))
        .sort((a, b) => a.mot.localeCompare(b.mot, "fr", { sensitivity: "base" }));
    }
    return letter ? getWordsByLetter(db, letter) : [];
  }, [db, letter, showFavorites, favorites]);

  const crumbs = [
    { label: "La Bible", onClick: onBack },
    { label: "Dictionnaire", onClick: goHome },
  ];
  if (showFavorites) crumbs.push({ label: "Favoris", onClick: () => setMot(null) });
  else if (letter) crumbs.push({ label: `Lettre ${letter}`, onClick: () => goLetter(letter) });
  if (mot) crumbs.push({ label: mot });

  // Clé d'écran pour l'animation de transition.
  const screen = mot ? `mot-${mot}` : showFavorites ? "fav" : letter ? `lettre-${letter}` : "home";

  return (
    <main className="mx-auto min-h-[80vh] max-w-3xl bg-black text-white md:my-6 md:overflow-hidden md:rounded-3xl">
      <div className="flex items-center gap-2 bg-zinc-800 px-3 py-3">
        <button onClick={back} aria-label="Retour" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10">
          <ArrowLeft className="h-6 w-6" />
        </button>
        {mot ? (
          <h1 className="min-w-0 flex-1 truncate text-lg text-slate-300">{mot}</h1>
        ) : letter && !showFavorites && !query ? (
          <h1 className="min-w-0 flex-1 truncate text-lg text-slate-300">Lettre {letter}</h1>
        ) : (
          <DictionarySearchBox db={db} query={query} onChange={setQuery} onPick={goWord} />
        )}
        <button
          onClick={() => {
            setShowFavorites((s) => !s);
            setMot(null);
            setQuery("");
          }}
          aria-label="Mes favoris"
          aria-pressed={showFavorites}
          className="rounded-lg p-1.5 hover:bg-white/10"
        >
          <Star className={`h-6 w-6 ${showFavorites ? "fill-slate-300 text-slate-300" : "text-slate-400"}`} />
        </button>
      </div>

      <div className="border-b border-zinc-800">
        <ConcordanceBreadcrumb crumbs={crumbs} />
      </div>

      {status !== "ready" ? (
        <DictionaryLoading status={status} progress={progress} error={error} onRetry={retry} />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            {mot ? (
              <DictionaryDefinition db={db} mot={mot} favorite={favorites.includes(mot)} onToggleFavorite={toggle} />
            ) : showFavorites || letter ? (
              <DictionaryWordList
                words={words}
                favorites={favorites}
                onToggleFavorite={toggle}
                onPick={goWord}
                empty={showFavorites ? "Aucun mot favori pour le moment." : "Aucun mot trouvé."}
              />
            ) : (
              <DictionaryLetterGrid available={letters} onPick={goLetter} />
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </main>
  );
}