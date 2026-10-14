import React, { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2, Search, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { WS_LEVELS, WS_CATEGORIES, wsLevelOf, wsCategoryLabel } from "@/lib/wordScrambleConstants";

const selectCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const PAGE = 20;

export default function WsWordList({ refreshKey, onEdit, onDelete, onPreview }) {
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
    if (term) {
      const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      q.$or = [{ word: rx }, { hint_phrase: rx }];
    }
    return q;
  };

  useEffect(() => {
    setLoading(true);
    const query = buildQuery();
    Promise.all([
      base44.entities.WordScrambleWord.filter(query, { sort: "-created_date", limit: PAGE }),
      base44.entities.WordScrambleWord.count(query),
    ]).then(([res, count]) => {
      setItems(res.items);
      setPage({ has_more: res.has_more, next_cursor: res.next_cursor });
      setTotal(count);
      setLoading(false);
    });
  }, [difficulty, category, term, refreshKey]);

  const loadMore = async () => {
    const res = await base44.entities.WordScrambleWord.filter(buildQuery(), { sort: "-created_date", limit: PAGE, cursor: page.next_cursor });
    setItems((prev) => [...prev, ...res.items]);
    setPage({ has_more: res.has_more, next_cursor: res.next_cursor });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mot ou phrase indice…" className={`${selectCls} w-full pl-9`} />
        </div>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={selectCls}>
          <option value="">Tous niveaux</option>
          {WS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          <option value="">Toutes catégories</option>
          {WS_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="text-xs font-bold text-foreground/50">{total} mot(s)</div>

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground/50">Aucun mot.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-bold text-foreground/60">
              <tr>
                <th className="px-3 py-2">Mot</th><th className="px-3 py-2">Difficulté</th><th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Phrase indice</th><th className="px-3 py-2">Référence</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const lvl = wsLevelOf(w.difficulty);
                return (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-3 py-2 font-extrabold">{w.word}</td>
                    <td className="px-3 py-2">{lvl && <span className={`rounded-full border px-2 py-0.5 text-2xs font-bold ${lvl.badge}`}>{lvl.emoji} {lvl.label}</span>}</td>
                    <td className="px-3 py-2">{wsCategoryLabel(w.category)}</td>
                    <td className="px-3 py-2 min-w-[14rem]">{w.hint_phrase}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{w.hint_bible_reference || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => onPreview(w)} aria-label="Aperçu" className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => onEdit(w)} aria-label="Modifier" className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => onDelete(w)} aria-label="Supprimer" className="h-9 w-9 grid place-items-center rounded-full border border-border text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {page.has_more && (
        <button onClick={loadMore} className="w-full rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted">Voir plus</button>
      )}
    </div>
  );
}