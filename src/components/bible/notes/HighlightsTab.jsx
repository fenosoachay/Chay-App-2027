import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  Loader2,
  Trash2,
  Search,
  X,
  Highlighter,
} from "lucide-react";
import { HIGHLIGHT_COLORS, highlightHex } from "@/lib/bibleConstants";
import { loadLocalBibleRaw } from "@/lib/localBible";
import { useTheme } from "@/hooks/useTheme";

const colorOf = (id) => HIGHLIGHT_COLORS.find((c) => c.id === id) || null;

// Index de la couleur dans HIGHLIGHT_COLORS (pour le tri "Couleur").
const colorIndex = (id) => {
  const i = HIGHLIGHT_COLORS.findIndex((c) => c.id === id);
  return i === -1 ? HIGHLIGHT_COLORS.length : i;
};

const dateOf = (a) => {
  const d = new Date(a.created_date || a.created_at || 0).getTime();
  return Number.isFinite(d) ? d : 0;
};

// Ordre canonique des livres (Genèse → Apocalypse), déduit du fichier
// biblique local (OT puis NT, dans l'ordre des livres).
async function buildCanonicalBookOrder() {
  const raw = await loadLocalBibleRaw("fr");
  const flat = [...(raw?.testament?.OT?.books || []), ...(raw?.testament?.NT?.books || [])];
  const order = {};
  flat.forEach((b, i) => {
    if (b.book_id && !(b.book_id in order)) order[b.book_id] = i + 1;
  });
  return order;
}

// Tri par ordre biblique : Livre → Chapitre → Verset.
// Le rang canonique du livre prime ; en cas d'inconnu, on retombe sur la
// comparaison alphabétique du nom du livre, puis chapitre et verset.
const byReference =
  (bookName, bookOrder) =>
  (a, b) =>
    (bookOrder[a.book_id] ?? 999) - (bookOrder[b.book_id] ?? 999) ||
    (bookName(a.translation_id, a.book_id) || "").localeCompare(
      bookName(b.translation_id, b.book_id) || "",
      "fr"
    ) ||
    a.chapter - b.chapter ||
    a.verse - b.verse;

const SORT_OPTIONS = [
  { id: "reference", label: "Référence" },
  { id: "recent", label: "Récent" },
  { id: "color", label: "Couleur" },
];

const SORT_STORAGE_KEY = "chay_highlights_sort";

export default function HighlightsTab({ api }) {
  const {
    annotations,
    loading,
    error,
    bookName,
    verseText,
    removeAnnotation,
    updateAnnotation,
  } = api;
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const isDarkMode = resolved === "dark";
  const [query, setQuery] = useState("");
  // Tri mémorisé dans localStorage pour persister le choix de l'utilisateur.
  const [sortBy, setSortBy] = useState(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      return SORT_OPTIONS.some((o) => o.id === saved) ? saved : "recent";
    } catch {
      return "recent";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      /* ignore */
    }
  }, [sortBy]);

  // Carte book_id → rang canonique (Genèse = 1 … Apocalypse = 66).
  const [bookOrder, setBookOrder] = useState({});
  useEffect(() => {
    let cancelled = false;
    buildCanonicalBookOrder()
      .then((map) => {
        if (!cancelled) setBookOrder(map);
      })
      .catch(() => {
        /* tri dégradé : alphabétique si le fichier local est indisponible */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => annotations.filter((a) => a.highlight_color),
    [annotations]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => {
      const ref = `${bookName(a.translation_id, a.book_id)} ${a.chapter}:${a.verse}`.toLowerCase();
      const text = verseText(a.translation_id, a.book_id, a.chapter, a.verse).toLowerCase();
      return ref.includes(q) || text.includes(q);
    });
  }, [items, query, bookName, verseText]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const cmpRef = byReference(bookName, bookOrder);
    if (sortBy === "reference") return list.sort(cmpRef);
    if (sortBy === "color")
      return list.sort(
        (a, b) => colorIndex(a.highlight_color) - colorIndex(b.highlight_color) || cmpRef(a, b)
      );
    // "recent" : du plus récent au plus ancien
    return list.sort((a, b) => dateOf(b) - dateOf(a));
  }, [filtered, sortBy, bookName, bookOrder]);

  const openInBible = (a) =>
    navigate(
      `/bible?view=reader&translation=${a.translation_id}&ref=${encodeURIComponent(
        a.book_id + " " + a.chapter
      )}&verse=${a.verse}`,
      { state: { chayBibleView: true } }
    );

  const remove = async (a) => {
    // Si une note existe, on retire seulement le surlignage ; sinon on
    // supprime l'annotation devenue vide.
    if (a.note) await updateAnnotation(a.id, { highlight_color: null });
    else await removeAnnotation(a.id);
  };

  if (loading)
    return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />;
  if (error)
    return <p className="mt-10 text-center text-sm text-destructive">{error}</p>;

  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? "Récent";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {items.length} surlignage{items.length > 1 ? "s" : ""}
        </p>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground select-none hover:bg-muted/40">
            <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
            {activeSortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setSortBy(o.id)}
                className={`block w-full px-3 py-2 text-left text-xs font-bold hover:bg-muted/40 ${
                  o.id === sortBy ? "text-primary" : "text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </details>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un verset surligné…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Highlighter}
          text={query ? "Aucun résultat." : "Aucun verset surligné."}
          hint={
            query
              ? ""
              : "Sélectionnez un verset dans la Bible puis touchez le surligneur."
          }
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => {
            const color = colorOf(a.highlight_color);
            const ref = `${bookName(a.translation_id, a.book_id)} ${a.chapter}:${a.verse}`;
            const text = verseText(a.translation_id, a.book_id, a.chapter, a.verse);
            return (
              <li key={a.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <span
                    style={{ backgroundColor: color ? highlightHex(color, isDarkMode) : undefined }}
                    className={`mt-1 inline-block h-4 w-4 shrink-0 rounded ${
                      !color ? "bg-primary/30" : ""
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{ref}</p>
                    {text && (
                      <p className="mt-1 line-clamp-3 text-sm text-foreground/70">
                        {text}
                      </p>
                    )}
                    {a.note && (
                      <p className="mt-1 text-xs text-primary">📝 {a.note}</p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => openInBible(a)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Ouvrir
                  </button>
                  <button
                    onClick={() => remove(a)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Retirer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, text, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40" />
      <div>
        <p className="font-bold text-foreground/70">{text}</p>
        {hint && (
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}