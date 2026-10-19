import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Loader2,
  Trash2,
  Pencil,
  Search,
  X,
  StickyNote,
  Check,
} from "lucide-react";

const refKey = (a) =>
  `${a.book_id}_${String(a.chapter).padStart(4, "0")}_${String(a.verse).padStart(4, "0")}`;

export default function PersonalNotesTab({ api }) {
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
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const items = useMemo(() => annotations.filter((a) => a.note), [annotations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) => {
      const ref = `${bookName(a.translation_id, a.book_id)} ${a.chapter}:${a.verse}`.toLowerCase();
      return ref.includes(q) || (a.note || "").toLowerCase().includes(q);
    });
  }, [items, query, bookName]);

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

  const startEdit = (a) => {
    setEditingId(a.id);
    setDraft(a.note || "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };
  const saveEdit = async (a) => {
    const text = draft.trim();
    if (!text) {
      await removeNote(a);
      return;
    }
    await updateAnnotation(a.id, { note: text });
    cancelEdit();
  };
  const removeNote = async (a) => {
    // Si un surlignage existe, on retire seulement la note ; sinon on supprime
    // l'annotation devenue vide.
    if (a.highlight_color) await updateAnnotation(a.id, { note: null });
    else await removeAnnotation(a.id);
    if (editingId === a.id) cancelEdit();
  };

  if (loading)
    return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />;
  if (error)
    return <p className="mt-10 text-center text-sm text-destructive">{error}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {items.length} note{items.length > 1 ? "s" : ""}
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
          placeholder="Rechercher une note…"
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
          icon={StickyNote}
          text={query ? "Aucun résultat." : "Aucune note personnelle."}
          hint={
            query
              ? ""
              : "Sélectionnez un verset dans la Bible puis touchez l'icône note."
          }
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((a) => {
            const ref = `${bookName(a.translation_id, a.book_id)} ${a.chapter}:${a.verse}`;
            const text = verseText(a.translation_id, a.book_id, a.chapter, a.verse);
            const isEditing = editingId === a.id;
            return (
              <li key={a.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <StickyNote className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{ref}</p>
                    {text && !isEditing && (
                      <p className="mt-1 line-clamp-2 text-xs text-foreground/60">
                        {text}
                      </p>
                    )}
                    {isEditing ? (
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        autoFocus
                        className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                        {a.note}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5" /> Annuler
                      </button>
                      <button
                        onClick={() => saveEdit(a)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                      >
                        <Check className="h-3.5 w-3.5" /> Enregistrer
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openInBible(a)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                      >
                        <BookOpen className="h-3.5 w-3.5" /> Ouvrir
                      </button>
                      <button
                        onClick={() => startEdit(a)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </button>
                      <button
                        onClick={() => removeNote(a)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </>
                  )}
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