import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { WS_LEVELS, WS_CATEGORIES } from "@/lib/wordScrambleConstants";
import {
  cleanWordScrambleCategory,
  mergeWordScrambleCategories,
} from "@/lib/wordScrambleCategories";
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
  const [imports, setImports] = useState([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllWordsOpen, setDeleteAllWordsOpen] = useState(false);

  const loadImports = async () => {
    const all = [];
    let cursor;
    do {
      const page = await base44.entities.WordScrambleImport.filter(
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  }, []);

  const getImportedWords = async (importId) => {
    const words = [];
    let cursor;
    do {
      const page = await base44.entities.WordScrambleWord.filter(
        { import_batch_id: importId },
        { sort: "created_date", limit: 200, cursor }
      );
      words.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return words;
  };

  const deleteImportData = async (importFile) => {
    const words = await getImportedWords(importFile.id);
    for (const word of words) {
      await base44.entities.WordScrambleWord.delete(word.id);
    }

    for (const value of importFile.category_values || []) {
      const remaining = await base44.entities.WordScrambleWord.filter(
        { category: value },
        { sort: "created_date", limit: 1 }
      );
      if (remaining.items.length) continue;

      const categoryRecords = await base44.entities.WordScrambleCategory.filter(
        { value },
        { sort: "label", limit: 200 }
      );
      await Promise.all(categoryRecords.items.map((category) =>
        base44.entities.WordScrambleCategory.delete(category.id)
      ));
    }

    await base44.entities.WordScrambleImport.delete(importFile.id);
    return words.length;
  };

  const deleteImportedFile = async (importFile) => {
    setDeleting(true);
    try {
      const deletedWords = await deleteImportData(importFile);
      setImports((current) => current.filter((item) => item.id !== importFile.id));
      setDeleteTarget(null);
      onImported?.();
      toast({
        title: "Import supprimé",
        description: `${deletedWords} mot(s) supprimé(s) avec ${importFile.file_name}.`,
      });
    } catch (error) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
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
        description: `${deletedFiles} fichier(s) et leurs mots ont été supprimés.`,
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

  const deleteAllWords = async () => {
    setDeleting(true);
    let deletedWords = 0;
    try {
      const words = [];
      let cursor;
      do {
        const page = await base44.entities.WordScrambleWord.filter(
          {},
          { sort: "created_date", limit: 200, cursor }
        );
        words.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);

      for (const word of words) {
        await base44.entities.WordScrambleWord.delete(word.id);
        deletedWords += 1;
      }

      setDeleteAllWordsOpen(false);
      onImported?.();
      toast({
        title: "Mots supprimés",
        description: `${deletedWords} mot(s) supprimé(s). Les catégories et l’historique des imports sont conservés.`,
      });
    } catch (error) {
      if (deletedWords > 0) onImported?.();
      toast({
        title: "Suppression interrompue",
        description: `${deletedWords} mot(s) supprimé(s). ${error?.message || "Réessayez."}`,
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
      const categoryRecords = await Promise.all(importedCategories.map(async (category) => ({
        category,
        records: (await base44.entities.WordScrambleCategory.filter(
          { value: category.value },
          { sort: "label", limit: 200 }
        )).items,
      })));
      const newCategoryValues = categoryRecords
        .filter(({ records }) => records.length === 0)
        .map(({ category }) => category.value);
      const importRecord = await base44.entities.WordScrambleImport.create({
        file_name: file.name,
        word_count: valid.length,
        skipped_count: skipped,
        category_values: newCategoryValues,
        status: "processing",
      });
      try {
        for (const { category, records } of categoryRecords) {
          if (records.length) {
            await Promise.all(records.map((record) =>
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
        if (valid.length) {
          await base44.entities.WordScrambleWord.bulkCreate(
            valid.map((word) => ({ ...word, import_batch_id: importRecord.id }))
          );
        }
        await base44.entities.WordScrambleImport.update(importRecord.id, {
          status: "complete",
        });
      } catch (error) {
        await base44.entities.WordScrambleImport.update(importRecord.id, {
          status: "failed",
          error: error?.message || "Échec de l'import.",
        });
        await loadImports();
        throw error;
      }
      toast({
        title: `${valid.length} mot(s) importé(s)`,
        description: [
          importedCategories.length ? `${importedCategories.length} catégorie(s) synchronisée(s)` : "",
          skipped ? `${skipped} ligne(s) ignorée(s) car incomplètes ou invalides.` : "",
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

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-bold">Fichiers JSON importés</h4>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteAllWordsOpen(true)}
              disabled={busy || deleting}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Supprimer tous les mots
            </button>
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
                      ? `${importFile.word_count || 0} mot(s)`
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
          Supprimer un import efface les mots de ce fichier. Les catégories utilisées par d’autres mots sont conservées.
        </p>
        <p className="text-xs text-muted-foreground">
          Les imports antérieurs à cette liste ne peuvent pas être associés à leur fichier d’origine.
        </p>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet import JSON ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les mots importés depuis « {deleteTarget?.file_name} » seront supprimés. Les catégories encore utilisées seront conservées.
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
              Les {imports.length} fichiers et tous leurs mots seront supprimés. Les catégories encore utilisées seront conservées.
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

      <AlertDialog open={deleteAllWordsOpen} onOpenChange={(open) => !open && !deleting && setDeleteAllWordsOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tous les mots mélangés ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les mots seront supprimés, qu’ils aient été importés ou ajoutés manuellement. Les catégories et l’historique des imports seront conservés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(event) => {
              event.preventDefault();
              deleteAllWords();
            }}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer tous les mots
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}