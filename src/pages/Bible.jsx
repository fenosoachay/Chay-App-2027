import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookMarked, BookOpen, Search } from "lucide-react";
import BibleReader from "@/components/bible/BibleReader";
import BibleDictionary from "@/components/bible/BibleDictionary";
import BibleConcordance from "@/components/bible/BibleConcordance";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { VERSIONS } from "@/lib/bibleConstants";
import useDictionarySubtitle from "@/hooks/useDictionarySubtitle";

// Les trois blocs sont décrits dans l'URL (?view=reader|dictionary|concordance)
// et non dans un useState : chaque bloc pousse donc une entrée d'historique et
// le bouton retour du téléphone revient au menu Bible, au lieu de sauter
// directement à l'accueil.
const VIEWS = ["reader", "dictionary", "concordance"];

export default function Bible() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dictionarySubtitle = useDictionarySubtitle();

  const viewParam = searchParams.get("view");
  const view = VIEWS.includes(viewParam)
    ? viewParam
    : // Arrivée directe sur un verset (lien ?ref=…) sans ?view= : lecteur.
      searchParams.get("ref")
      ? "reader"
      : "home";

  // Only pop when this view was opened from inside the app; direct links return
  // to the Bible module menu instead of leaving the app.
  const goBack = () => {
    const openedInApp =
      hasNavigationOrigin(window.history.state, "chayBibleView") ||
      hasNavigationOrigin(window.history.state, "chayBibleVerse");
    if (viewParam && openedInApp) {
      navigate(-1);
    }
    else setSearchParams({}, { replace: true });
  };

  const openView = (v) => {
    if (view === v) return;
    navigate(`/bible?view=${v}`, {
      replace: false,
      state: { chayBibleView: true },
    });
  };

  // Ouvre un verset trouvé par la concordance dans le lecteur, dans la bonne
  // langue (le lecteur lit ?translation=, ?ref= et ?verse=).
  const openVerse = (lang, { bookId, chapter, verse }) => {
    setSearchParams(
      {
        view: "reader",
        translation: VERSIONS[lang][0].id,
        ref: `${bookId} ${chapter}`,
        verse: String(verse),
      },
      { state: { chayBibleVerse: true } }
    );
  };

  if (view === "reader") return <BibleReader onBack={goBack} />;
  if (view === "dictionary") return <BibleDictionary onBack={goBack} />;
  if (view === "concordance") return <BibleConcordance onBack={goBack} onOpenVerse={openVerse} />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-4 md:px-8 md:py-10">
      <header className="mb-5 flex items-center gap-2.5">
        <div className="rounded-xl bg-primary/10 p-2">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">La Bible</h1>
          <p className="text-xs text-muted-foreground">Choisissez un module pour commencer</p>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          onClick={() => openView("reader")}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl brand-gradient text-white shadow-sm transition group-hover:scale-105">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-bold text-foreground">Bible</h2>
            <p className="text-[11px] text-muted-foreground">Français & Malagasy</p>
          </div>
        </button>

        <button
          onClick={() => openView("dictionary")}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground shadow-sm transition group-hover:scale-105">
            <BookMarked className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-bold text-foreground">Dictionnaire</h2>
            <p className="text-[11px] text-muted-foreground">{dictionarySubtitle}</p>
          </div>
        </button>

        <button
          onClick={() => openView("concordance")}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl brand-gradient text-white shadow-sm transition group-hover:scale-105">
            <Search className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-bold text-foreground">Concordance</h2>
            <p className="text-[11px] text-muted-foreground">Tous les mots de la Bible</p>
          </div>
        </button>
      </div>
    </main>
  );
}