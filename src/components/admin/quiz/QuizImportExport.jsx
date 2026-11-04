import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { QUIZ_LEVELS } from "@/lib/quizConstants";
import { cleanQuizCategory } from "@/lib/quizCategories";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export default function QuizImportExport({ categories = [], onImported }) {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);

  const loadImports = async () => {
    const all = [];
    let cursor;
    do {
      const page = await base44.entities.QuizImport.filter(
        {},
        { sort: "-created_date", limit: 200, cursor }
      );
      all.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    setImports(all);
    setLoadingImports(false);
  };

  useEffect(() => {
    loadImports().catch((error) => {
      setLoadingImports(false);
      toast({
        title: "Impossible de charger les imports",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    });
  }, []);

  const getImportedQuestions = async (importId) => {
    const questions = [];
    let cursor;
    do {
      const page = await base44.entities.QuizQuestion.filter(
        { import_batch_id: importId },
        { sort: "created_date", limit: 200, cursor }
      );
      questions.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return questions;
  };

  const deleteImportData = async (importFile) => {
    const questions = await getImportedQuestions(importFile.id);
    for (const question of questions) {
      await base44.entities.QuizQuestion.delete(question.id);
    }

    for (const value of importFile.category_values || []) {
      const remaining = await base44.entities.QuizQuestion.filter(
        { category: value },
        { sort: "created_date", limit: 1 }
      );
      if (remaining.items.length) continue;

      const categoryRecords = await base44.entities.QuizCategory.filter(
        { value },
        { sort: "label", limit: 200 }
      );
      await Promise.all(categoryRecords.items.map((category) =>
        base44.entities.QuizCategory.delete(category.id)
      ));
    }

    await base44.entities.QuizImport.delete(importFile.id);
    return questions.length;
  };

  const deleteImportedFile = async (importFile) => {
    setDeleting(true);
    try {
      const deletedQuestions = await deleteImportData(importFile);
      setImports((current) => current.filter((item) => item.id !== importFile.id));
      setDeleteTarget(null);
      onImported?.();
      toast({
        title: "Import supprimé",
        description: `${deletedQuestions} question(s) supprimée(s) avec ${importFile.file_name}.`,
      });
      return true;
    } catch (error) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllImports = async () => {
    setDeleting(true);
    let deletedFiles = 0;
    try {
      for (const importFile of imports) {
        await deleteImportData(importFile);
        deletedFiles += 1;
        setImports((current) => current.filter((item) => item.id !== importFile.id));
      }
      setDeleteAllOpen(false);
      onImported?.();
      toast({
        title: "Imports supprimés",
        description: `${deletedFiles} fichier(s) et leurs questions ont été supprimés.`,
      });
    } catch (error) {
      if (deletedFiles > 0) onImported?.();
      toast({
        title: "Suppression interrompue",
        description: `${deletedFiles} fichier(s) supprimé(s). ${error?.message || "Réessayez."}`,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const exportJson = async () => {
    setBusy(true);
    try {
      const all = [];
      let cursor;
      do {
        const page = await base44.entities.QuizQuestion.filter({}, { sort: "created_date", limit: 200, cursor });
        all.push(...page.items.map((q) => Object.fromEntries(FIELDS.map((k) => [k, q[k] ?? ""]))));
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      const payload = { categories, questions: all };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "quiz-biblique.json";
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
      list = Array.isArray(parsed) ? parsed : parsed.questions;
      importedCategories = Array.isArray(parsed?.categories)
        ? parsed.categories.map(cleanQuizCategory).filter(Boolean)
        : [];
      if (!Array.isArray(list)) throw new Error("Le fichier ne contient pas de liste de questions.");
    } catch (error) {
      toast({
        title: "Fichier invalide",
        description: error?.message || "Le fichier n'est pas un JSON valide.",
        variant: "destructive",
      });
      setBusy(false);
      return;
    }
    const valid = (list || []).map(clean).filter(Boolean);
    const skipped = (list || []).length - valid.length;
    try {
      const existingValues = new Set(categories.map((category) => category.value));
      const newCategories = importedCategories.filter((category) => {
        if (existingValues.has(category.value)) return false;
        existingValues.add(category.value);
        return true;
      });
      if (valid.length || newCategories.length) {
        const importRecord = await base44.entities.QuizImport.create({
          file_name: file.name,
          question_count: valid.length,
          skipped_count: skipped,
          category_values: newCategories.map((category) => category.value),
          status: "processing",
        });
        try {
          if (newCategories.length) {
            await base44.entities.QuizCategory.bulkCreate(newCategories);
          }
          if (valid.length) {
            await base44.entities.QuizQuestion.bulkCreate(
              valid.map((question) => ({ ...question, import_batch_id: importRecord.id }))
            );
          }
          await base44.entities.QuizImport.update(importRecord.id, {
            status: "complete",
          });
        } catch (error) {
          await base44.entities.QuizImport.update(importRecord.id, {
            status: "failed",
            error: error?.message || "Échec de l'import.",
          });
          await loadImports();
          throw error;
        }
      }
      toast({
        title: `${valid.length} question(s) importée(s)`,
        description: [
          newCategories.length ? `${newCategories.length} catégorie(s) ajoutée(s)` : "",
          skipped ? `${skipped} question(s) ignorée(s) car incomplètes ou invalides` : "",
        ].filter(Boolean).join(" · ") || undefined,
      });
      await loadImports();
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
        Format attendu : un objet JSON avec <code>categories</code> et <code>questions</code>. Les anciennes listes de questions restent importables.
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

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-bold">Fichiers JSON importés</h4>
          {imports.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteAllOpen(true)}
              disabled={busy || deleting}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Tout supprimer
            </button>
          )}
        </div>
        {loadingImports ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des imports…
          </div>
        ) : imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun fichier JSON importé.</p>
        ) : (
          <div className="space-y-2">
            {imports.map((importFile) => (
              <div key={importFile.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{importFile.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {importFile.status === "complete"
                      ? `${importFile.question_count || 0} question(s)`
                      : importFile.status === "failed"
                        ? `Import incomplet${importFile.error ? ` : ${importFile.error}` : ""}`
                        : "Import en cours"}
                    {importFile.created_date
                      ? ` · ${new Date(importFile.created_date).toLocaleDateString("fr-FR")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(importFile)}
                  disabled={busy || deleting}
                  aria-label={`Supprimer ${importFile.file_name}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          La suppression d’un import enlève ses questions. Les catégories utilisées par d’autres questions sont conservées.
        </p>
        <p className="text-xs text-muted-foreground">
          Les imports effectués avant l’ajout de cette liste ne peuvent pas être associés à leur fichier d’origine.
        </p>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet import JSON ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les questions importées depuis « {deleteTarget?.file_name} » seront supprimées. Les catégories encore utilisées seront conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(event) => {
              event.preventDefault();
              deleteTarget && deleteImportedFile(deleteTarget);
            }}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => !open && !deleting && setDeleteAllOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tous les imports JSON ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {imports.length} fichiers et toutes leurs questions seront supprimés. Les catégories encore utilisées seront conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(event) => {
              event.preventDefault();
              deleteAllImports();
            }}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Tout supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}