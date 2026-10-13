import React, { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { QUIZ_LEVELS } from "@/lib/quizConstants";

const FIELDS = [
  "question", "option_a", "option_b", "option_c", "option_d",
  "correct_answer", "difficulty", "category", "explanation",
];
const LEVELS = QUIZ_LEVELS.map((l) => l.value);

// Retourne la question nettoyée, ou null si elle est invalide.
function clean(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = {};
  FIELDS.forEach((k) => { q[k] = typeof raw[k] === "string" ? raw[k].trim() : ""; });
  q.correct_answer = q.correct_answer.toUpperCase();
  if (!q.question || !q.option_a || !q.option_b || !q.option_c || !q.option_d) return null;
  if (!["A", "B", "C", "D"].includes(q.correct_answer)) return null;
  if (!LEVELS.includes(q.difficulty)) return null;
  return q;
}

export default function QuizImportExport({ onImported }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    setBusy(true);
    const all = [];
    let cursor;
    do {
      const page = await base44.entities.QuizQuestion.filter({}, { sort: "created_date", limit: 200, cursor });
      all.push(...page.items.map((q) => Object.fromEntries(FIELDS.map((k) => [k, q[k] ?? ""]))));
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "quiz-biblique.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    let list;
    try {
      const parsed = JSON.parse(await file.text());
      list = Array.isArray(parsed) ? parsed : parsed.questions;
    } catch {
      toast({ title: "Fichier invalide", description: "Le fichier n'est pas un JSON valide.", variant: "destructive" });
      setBusy(false);
      return;
    }
    const valid = (list || []).map(clean).filter(Boolean);
    const skipped = (list || []).length - valid.length;
    if (valid.length) await base44.entities.QuizQuestion.bulkCreate(valid);
    toast({
      title: `${valid.length} question(s) importée(s)`,
      description: skipped ? `${skipped} ligne(s) ignorée(s) car incomplètes ou invalides.` : undefined,
    });
    setBusy(false);
    onImported?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Format attendu : une liste d'objets avec <code>question</code>, <code>option_a</code> à <code>option_d</code>,{" "}
        <code>correct_answer</code> (A–D), <code>difficulty</code> (easy, medium, hard), <code>category</code>, <code>explanation</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportJson} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exporter en JSON
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50">
          <Upload className="h-4 w-4" /> Importer un JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
      </div>
    </div>
  );
}