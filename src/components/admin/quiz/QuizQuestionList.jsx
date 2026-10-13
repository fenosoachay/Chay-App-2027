import React, { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { QUIZ_LEVELS, QUIZ_CATEGORIES, levelOf, categoryLabel } from "@/lib/quizConstants";

const selectCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const PAGE = 20;

export default function QuizQuestionList({ refreshKey, onEdit, onDelete }) {
  const [difficulty, setDifficulty] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState({ has_more: false, next_cursor: null });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildQuery = () => {
    const q = {};
    if (difficulty) q.difficulty = difficulty;
    if (category) q.category = category;
    if (term) q.question = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    return q;
  };

  useEffect(() => {
    setLoading(true);
    const query = buildQuery();
    Promise.all([
      base44.entities.QuizQuestion.filter(query, { sort: "-created_date", limit: PAGE }),
      base44.entities.QuizQuestion.count(query),
    ]).then(([res, count]) => {
      setItems(res.items);
      setPage({ has_more: res.has_more, next_cursor: res.next_cursor });
      setTotal(count);
      setLoading(false);
    });
  }, [difficulty, category, term, refreshKey]);

  const loadMore = async () => {
    const res = await base44.entities.QuizQuestion.filter(buildQuery(), {
      sort: "-created_date", limit: PAGE, cursor: page.next_cursor,
    });
    setItems((prev) => [...prev, ...res.items]);
    setPage({ has_more: res.has_more, next_cursor: res.next_cursor });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une question…"
            className={`${selectCls} w-full pl-9`}
          />
        </div>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls}>
          <option value="">Tous niveaux</option>
          {QUIZ_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          <option value="">Toutes catégories</option>
          {QUIZ_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="text-xs font-bold text-foreground/50">{total} question(s)</div>

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground/50">Aucune question.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((q) => {
            const lvl = levelOf(q.difficulty);
            return (
              <li key={q.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm leading-snug">{q.question}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs font-bold">
                    {lvl && <span className={`rounded-full border px-2 py-0.5 ${lvl.badge}`}>{lvl.emoji} {lvl.label}</span>}
                    <span className="rounded-full border border-border px-2 py-0.5 text-foreground/60">{categoryLabel(q.category)}</span>
                    <span className="rounded-full bg-green-500/15 text-green-500 px-2 py-0.5">Réponse : {q.correct_answer}</span>
                  </div>
                </div>
                <button onClick={() => onEdit(q)} aria-label="Modifier" className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(q)} aria-label="Supprimer" className="h-9 w-9 grid place-items-center rounded-full border border-border text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {page.has_more && (
        <button onClick={loadMore} className="w-full rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted">
          Voir plus
        </button>
      )}
    </div>
  );
}