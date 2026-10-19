import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Loader2,
  Trash2,
  Search,
  X,
  Highlighter,
} from "lucide-react";
import { HIGHLIGHT_COLORS } from "@/lib/bibleConstants";

const colorOf = (id) => HIGHLIGHT_COLORS.find((c) => c.id === id) || null;

const refKey = (a) =>
  `${a.book_id}_${String(a.chapter).padStart(4, "0")}_${String(a.verse).padStart(4, "0")}`;

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
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date");

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
    if (sortBy === "reference") {
      return [...filtered].sort((a, b) => {
        const ra = refKey(a);
        const rb = refKey(b);
        return ra < rb ? -1 : ra > rb ? 1 : 0;
      });
    }
    return filtered;
  }, [filtered, sortBy]);

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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {items.length} surlignage{items.length > 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setSortBy((s) => (s === "date" ? "reference" : "date"))}
          className="text-xs font-bold text-primary hover:underline"
        >
          Trier : {sortBy === "date" ? "Récents" : "Référence"}
        </button>
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
                    className={`mt-1 inline-block h-4 w-4 shrink-0 rounded ${
                      color?.verse || "bg-primary/30"
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