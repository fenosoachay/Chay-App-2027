import React, { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { QUIZ_LEVELS, QUIZ_CATEGORIES, EMPTY_QUESTION } from "@/lib/quizConstants";

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

export default function QuizQuestionForm({ initial, saving, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_QUESTION);
  useEffect(() => setForm(initial || EMPTY_QUESTION), [initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const valid =
    form.question.trim() &&
    ["option_a", "option_b", "option_c", "option_d"].every((k) => form[k].trim());

  const submit = (e) => {
    e.preventDefault();
    if (valid) onSave(form);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Question *">
        <textarea rows={2} value={form.question} onChange={set("question")} className={inputCls} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {["a", "b", "c", "d"].map((l) => (
          <Field key={l} label={`Option ${l.toUpperCase()} *`}>
            <input value={form[`option_${l}`]} onChange={set(`option_${l}`)} className={inputCls} />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Réponse correcte *">
          <select value={form.correct_answer} onChange={set("correct_answer")} className={inputCls}>
            {["A", "B", "C", "D"].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Difficulté *">
          <select value={form.difficulty} onChange={set("difficulty")} className={inputCls}>
            {QUIZ_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="Catégorie">
          <select value={form.category || ""} onChange={set("category")} className={inputCls}>
            {QUIZ_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Explication (affichée après la réponse)">
        <textarea rows={2} value={form.explanation || ""} onChange={set("explanation")} className={inputCls} />
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid || saving}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {initial?.id ? "Enregistrer" : "Ajouter la question"}
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