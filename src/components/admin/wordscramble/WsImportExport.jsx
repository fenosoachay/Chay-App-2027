import React, { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { WS_LEVELS, WS_CATEGORIES } from "@/lib/wordScrambleConstants";

const FIELDS = ["word", "difficulty", "category", "hint_phrase", "hint_bible_reference"];
const LEVELS = WS_LEVELS.map((l) => l.value);
const CATEGORIES = WS_CATEGORIES.map((c) => c.value);

// Nettoie un mot importé ; null si invalide.
function clean(raw) {
  if (!raw || typeof raw !== "object") return null;
  const w = {};
  FIELDS.forEach((k) => { w[k] = typeof raw[k] === "string" ? raw[k].trim() : ""; });
  w.word = w.word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  if (!w.word || !w.hint_phrase || !LEVELS.includes(w.difficulty)) return null;
  if (w.category && !CATEGORIES.includes(w.category)) return null;
  if (!w.category) delete w.category;
  if (!w.hint_bible_reference) delete w.hint_bible_reference;
  return w;
}

export default function WsImportExport({ onImported }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    setBusy(true);
    const all = [];
    let cursor;
    do {
      const page = await base44.entities.WordScrambleWord.filter({}, { sort: "created_date", limit: 200, cursor });
      all.push(...page.items.map((w) => Object.fromEntries(FIELDS.map((k) => [k, w[k] ?? ""]))));
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mots-meles.json";
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
      list = Array.isArray(parsed) ? parsed : parsed.words;
    } catch {
      toast({ title: "Fichier invalide", description: "Le fichier n'est pas un JSON valide.", variant: "destructive" });
      setBusy(false);
      return;
    }
    const valid = (list || []).map(clean).filter(Boolean);
    const skipped = (list || []).length - valid.length;
    if (valid.length) await base44.entities.WordScrambleWord.bulkCreate(valid);
    toast({
      title: `${valid.length} mot(s) importé(s)`,
      description: skipped ? `${skipped} ligne(s) ignorée(s) car incomplètes ou invalides.` : undefined,
    });
    setBusy(false);
    onImported?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Format attendu : une liste d'objets avec <code>word</code>, <code>difficulty</code> (easy, medium, hard, ultra_hard),{" "}
        <code>category</code> (personnage, lieu, objet, concept, livre_bible), <code>hint_phrase</code> et <code>hint_bible_reference</code> (optionnel).
      </p>
      <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{`[
  {
    "word": "GETHSEMANE",
    "difficulty": "hard",
    "category": "lieu",
    "hint_phrase": "Jardin où Jésus a prié avant son arrestation",
    "hint_bible_reference": "Matthieu 26:36"
  }
]`}</pre>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportJson} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exporter tous les mots en JSON
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50">
          <Upload className="h-4 w-4" /> Importer des mots depuis JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
      </div>
    </div>
  );
}