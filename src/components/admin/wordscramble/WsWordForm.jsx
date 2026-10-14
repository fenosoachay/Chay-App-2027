import React, { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { WS_LEVELS, WS_CATEGORIES, EMPTY_WORD } from "@/lib/wordScrambleConstants";

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

export default function WsWordForm({ initial, saving, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_WORD);
  useEffect(() => setForm(initial || EMPTY_WORD), [initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const valid = form.word.trim() && form.hint_phrase.trim();

  const submit = (e) => {
    e.preventDefault();
    if (valid) onSave(form);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Mot *">
          <input value={form.word} onChange={(e) => setForm((f) => ({ ...f, word: e.target.value.toUpperCase() }))} className={inputCls} />
        </Field>
        <Field label="Difficulté *">
          <select value={form.difficulty} onChange={set("difficulty")} className={inputCls}>
            {WS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Catégorie">
          <select value={form.category || ""} onChange={set("category")} className={inputCls}>
            {WS_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Phrase indice *">
        <textarea rows={2} value={form.hint_phrase} onChange={set("hint_phrase")} className={inputCls} />
      </Field>
      <Field label="Référence biblique (optionnel)">
        <input value={form.hint_bible_reference || ""} onChange={set("hint_bible_reference")} className={inputCls} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || saving} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {initial?.id ? "Enregistrer" : "Ajouter le mot"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold">
            <X className="h-4 w-4" /> Annuler
          </button>
        )}
      </div>
    </form>
  );
}