import React, { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { WS_LEVELS, WS_CATEGORIES } from "@/lib/wordScrambleConstants";
import {
  cleanWordScrambleCategory,
  mergeWordScrambleCategories,
} from "@/lib/wordScrambleCategories";

const FIELDS = ["word", "difficulty", "category", "hint_phrase", "hint_bible_reference"];
const LEVELS = WS_LEVELS.map((l) => l.value);

// Nettoie un mot importé ; null si invalide.
function clean(raw, categoryValues) {
  if (!raw || typeof raw !== "object") return null;
  const w = {};
  FIELDS.forEach((k) => { w[k] = typeof raw[k] === "string" ? raw[k].trim() : ""; });
  w.word = w.word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  if (!w.word || !w.hint_phrase || !LEVELS.includes(w.difficulty)) return null;
  if (w.category && !categoryValues.has(w.category)) return null;
  if (!w.category) delete w.category;
  if (!w.hint_bible_reference) delete w.hint_bible_reference;
  return w;
}

export default function WsImportExport({ categories = WS_CATEGORIES, categoriesReady = true, onImported }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const exportJson = async () => {
    setBusy(true);
    try {
      const all = [];
      let cursor;
      do {
        const page = await base44.entities.WordScrambleWord.filter({}, { sort: "created_date", limit: 200, cursor });
        all.push(...page.items.map((w) => Object.fromEntries(FIELDS.map((k) => [k, w[k] ?? ""]))));
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      const payload = { categories, words: all };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mots-meles.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      toast({
        title: "Export impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const importJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    let list;
    let importedCategories = [];
    try {
      const parsed = JSON.parse(await file.text());
      list = Array.isArray(parsed) ? parsed : parsed.words;
      importedCategories = Array.isArray(parsed?.categories)
        ? parsed.categories.map(cleanWordScrambleCategory).filter(Boolean)
        : [];
      if (!Array.isArray(list)) throw new Error("Le fichier ne contient pas de liste de mots.");
    } catch {
      toast({ title: "Fichier invalide", description: "Le fichier ne contient pas un JSON valide de mots.", variant: "destructive" });
      setBusy(false);
      return;
    }
    const activeCategories = mergeWordScrambleCategories([...categories, ...importedCategories]);
    const categoryValues = new Set(activeCategories.map((category) => category.value));
    const valid = list.map((word) => clean(word, categoryValues)).filter(Boolean);
    const skipped = list.length - valid.length;
    try {
      for (const category of importedCategories) {
        const page = await base44.entities.WordScrambleCategory.filter(
          { value: category.value },
          { sort: "label", limit: 200 }
        );
        if (page.items.length) {
          await Promise.all(page.items.map((record) =>
            base44.entities.WordScrambleCategory.update(record.id, {
              value: category.value,
              label: category.label,
              is_deleted: false,
            })
          ));
        } else {
          await base44.entities.WordScrambleCategory.create(category);
        }
      }
      if (valid.length) await base44.entities.WordScrambleWord.bulkCreate(valid);
      toast({
        title: `${valid.length} mot(s) importé(s)`,
        description: [
          importedCategories.length ? `${importedCategories.length} catégorie(s) synchronisée(s)` : "",
          skipped ? `${skipped} ligne(s) ignorée(s) car incomplètes ou invalides.` : "",
        ].filter(Boolean).join(" · ") || undefined,
      });
      onImported?.();
    } catch (error) {
      toast({
        title: "Import impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Export JSON : un objet contenant les catégories personnalisées/modifiées et la liste <code>words</code>. Les anciennes listes de mots restent importables.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportJson} disabled={busy || !categoriesReady} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exporter tous les mots en JSON
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy || !categoriesReady} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50">
          <Upload className="h-4 w-4" /> Importer des mots depuis JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
      </div>
    </div>
  );
}