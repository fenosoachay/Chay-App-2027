import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import WsStats from "@/components/admin/wordscramble/WsStats";
import WsWordForm from "@/components/admin/wordscramble/WsWordForm";
import WsWordList from "@/components/admin/wordscramble/WsWordList";
import WsImportExport from "@/components/admin/wordscramble/WsImportExport";
import WsPreviewDialog from "@/components/admin/wordscramble/WsPreviewDialog";
import WsCategoryManager from "@/components/admin/wordscramble/WsCategoryManager";
import { WS_CATEGORIES } from "@/lib/wordScrambleConstants";
import { mergeWordScrambleCategories } from "@/lib/wordScrambleCategories";

function Block({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
      <h3 className="font-display font-extrabold text-lg mb-3">{title}</h3>
      {children}
    </section>
  );
}

const normalize = (value) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();

export default function WordScrambleAdminPanel() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(WS_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      const records = [];
      let cursor;
      do {
        const page = await base44.entities.WordScrambleCategory.filter(
          {},
          { sort: "label", limit: 200, cursor }
        );
        records.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return records;
    };
    loadCategories()
      .then((records) => {
        if (active) {
          setCategories(mergeWordScrambleCategories(records));
          setCategoriesLoading(false);
        }
      })
      .catch((error) => {
        if (active) setCategoriesLoading(false);
        toast({
          title: "Impossible de charger les catégories",
          description: error?.message || "Les catégories par défaut restent disponibles.",
          variant: "destructive",
        });
      });
    return () => { active = false; };
  }, [refreshKey, toast]);

  const getCategoryRecords = async (value) => {
    const records = [];
    let cursor;
    do {
      const page = await base44.entities.WordScrambleCategory.filter(
        { value },
        { sort: "label", limit: 200, cursor }
      );
      records.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return records;
  };

  const updateCategory = async (category) => {
    const records = await getCategoryRecords(category.value);
    const data = { value: category.value, label: category.label, is_deleted: false };
    if (records.length) {
      await Promise.all(records.map((record) =>
        base44.entities.WordScrambleCategory.update(record.id, data)
      ));
    } else {
      await base44.entities.WordScrambleCategory.create(data);
    }
    setCategories((current) => mergeWordScrambleCategories([...current, data]));
  };

  const deleteCategory = async (category) => {
    const count = await base44.entities.WordScrambleWord.count({ category: category.value });
    if (count > 0) {
      throw new Error(`${count} mot(s) utilisent encore cette catégorie. Réaffectez-les avant de la supprimer.`);
    }
    const records = await getCategoryRecords(category.value);
    if (WS_CATEGORIES.some((item) => item.value === category.value)) {
      if (records.length) {
        await Promise.all(records.map((record) =>
          base44.entities.WordScrambleCategory.update(record.id, { is_deleted: true })
        ));
      } else {
        await base44.entities.WordScrambleCategory.create({
          value: category.value,
          label: category.label,
          is_deleted: true,
        });
      }
    } else {
      await Promise.all(records.map((record) =>
        base44.entities.WordScrambleCategory.delete(record.id)
      ));
    }
    setCategories((current) => mergeWordScrambleCategories([
      ...current,
      { value: category.value, label: category.label, is_deleted: true },
    ]));
    refresh();
  };

  const save = async (form) => {
    setSaving(true);
    const data = {
      word: normalize(form.word),
      difficulty: form.difficulty,
      category: form.category || undefined,
      hint_phrase: form.hint_phrase.trim(),
      hint_bible_reference: (form.hint_bible_reference || "").trim(),
    };
    if (form.id) {
      await base44.entities.WordScrambleWord.update(form.id, data);
      toast({ title: "Mot modifié" });
      setEditing(null);
    } else {
      await base44.entities.WordScrambleWord.create(data);
      toast({ title: "Mot ajouté" });
    }
    setSaving(false);
    refresh();
  };

  const confirmDelete = async () => {
    await base44.entities.WordScrambleWord.delete(toDelete.id);
    toast({ title: "Mot supprimé" });
    setToDelete(null);
    refresh();
  };

  return (
    <div className="space-y-5">
      <Block title="Statistiques"><WsStats refreshKey={refreshKey} /></Block>

      <Block title={editing ? "Modifier le mot" : "Ajouter un mot"}>
        <WsWordForm key={editing?.id || "new"} initial={editing} saving={saving} onSave={save} onCancel={editing ? () => setEditing(null) : undefined} categories={categories} />
      </Block>

      <Block title="Gérer les catégories">
        <WsCategoryManager
          categories={categories}
          disabled={categoriesLoading}
          onCreated={(category) =>
            setCategories((current) => mergeWordScrambleCategories([...current, category]))
          }
          onUpdated={updateCategory}
          onDelete={deleteCategory}
        />
      </Block>

      <Block title="Liste des mots">
        <WsWordList
          refreshKey={refreshKey}
          categories={categories}
          onEdit={(w) => { setEditing(w); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDelete={setToDelete}
          onPreview={setPreview}
        />
      </Block>

      <Block title="Import / Export"><WsImportExport categories={categories} categoriesReady={!categoriesLoading} onImported={refresh} /></Block>

      <WsPreviewDialog word={preview} onClose={() => setPreview(null)} />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce mot ?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.word}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}