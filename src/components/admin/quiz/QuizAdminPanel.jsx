import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
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
import QuizStats from "@/components/admin/quiz/QuizStats";
import QuizQuestionForm from "@/components/admin/quiz/QuizQuestionForm";
import QuizQuestionList from "@/components/admin/quiz/QuizQuestionList";
import QuizImportExport from "@/components/admin/quiz/QuizImportExport";
import QuizCategoryManager from "@/components/admin/quiz/QuizCategoryManager";
import { QUIZ_CATEGORIES } from "@/lib/quizConstants";
import { mergeQuizCategories } from "@/lib/quizCategories";

function Block({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
      <h3 className="font-display font-extrabold text-lg mb-3">{title}</h3>
      {children}
    </section>
  );
}

async function getAllPages(entity, query, sort) {
  const items = [];
  let cursor;
  do {
    const page = await entity.filter(query, { sort, limit: 200, cursor });
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return items;
}

export default function QuizAdminPanel() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState(QUIZ_CATEGORIES);
  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      const loaded = [];
      let cursor;
      do {
        const page = await base44.entities.QuizCategory.filter(
          {},
          { sort: "label", limit: 200, cursor }
        );
        loaded.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return loaded;
    };
    loadCategories()
      .then((loaded) => {
        if (active) setCategories(mergeQuizCategories(loaded));
      })
      .catch((error) => {
        toast({
          title: "Impossible de charger les catégories",
          description: error?.message || "Les catégories par défaut restent disponibles.",
          variant: "destructive",
        });
      });
    return () => { active = false; };
  }, [refreshKey, toast]);

  const updateCategory = async (category) => {
    const records = await getAllPages(base44.entities.QuizCategory, { value: category.value }, "label");
    const data = { value: category.value, label: category.label, is_deleted: false };
    if (records.length) {
      await Promise.all(records.map((record) =>
        base44.entities.QuizCategory.update(record.id, data)
      ));
    } else {
      await base44.entities.QuizCategory.create(data);
    }
    setCategories((current) => mergeQuizCategories([...current, data]));
  };

  const deleteCategory = async (category) => {
    const fallbackLabel = categories.find((item) => item.value === "autre")?.label || "Autre";
    if (category.value === "autre") {
      throw new Error(`La catégorie « ${fallbackLabel} » est nécessaire pour réassigner les questions.`);
    }

    const questions = await getAllPages(
      base44.entities.QuizQuestion,
      { category: category.value },
      "created_date"
    );
    let reassigned = 0;
    try {
      for (const question of questions) {
        await base44.entities.QuizQuestion.update(question.id, { category: "autre" });
        reassigned += 1;
      }
    } catch (error) {
      throw new Error(
        `${reassigned} question(s) ont été réassignées à « ${fallbackLabel} », mais la suppression a été interrompue : ${error?.message || "réessayez."}`
      );
    }

    const records = await getAllPages(base44.entities.QuizCategory, { value: category.value }, "label");
    if (QUIZ_CATEGORIES.some((item) => item.value === category.value)) {
      if (records.length) {
        await Promise.all(records.map((record) =>
          base44.entities.QuizCategory.update(record.id, { is_deleted: true })
        ));
      } else {
        await base44.entities.QuizCategory.create({
          value: category.value,
          label: category.label,
          is_deleted: true,
        });
      }
    } else {
      await Promise.all(records.map((record) =>
        base44.entities.QuizCategory.delete(record.id)
      ));
    }
    setCategories((current) => mergeQuizCategories([
      ...current,
      { value: category.value, label: category.label, is_deleted: true },
    ]));
    refresh();
  };

  const save = async (form) => {
    setSaving(true);
    const data = {
      question: form.question.trim(),
      option_a: form.option_a.trim(),
      option_b: form.option_b.trim(),
      option_c: form.option_c.trim(),
      option_d: form.option_d.trim(),
      correct_answer: form.correct_answer,
      difficulty: form.difficulty,
      category: form.category || "",
      explanation: (form.explanation || "").trim(),
    };
    if (form.id) {
      await base44.entities.QuizQuestion.update(form.id, data);
      toast({ title: "Question modifiée" });
      setEditing(null);
    } else {
      await base44.entities.QuizQuestion.create(data);
      toast({ title: "Question ajoutée" });
    }
    setSaving(false);
    refresh();
  };

  const confirmDelete = async () => {
    await base44.entities.QuizQuestion.delete(toDelete.id);
    toast({ title: "Question supprimée" });
    setToDelete(null);
    refresh();
  };

  return (
    <div className="space-y-5">
      <Block title="Statistiques"><QuizStats refreshKey={refreshKey} /></Block>

      <Block title={editing ? "Modifier la question" : "Ajouter une question"}>
        <QuizQuestionForm
          key={editing?.id || "new"}
          initial={editing}
          saving={saving}
          categories={categories}
          onSave={save}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </Block>

      <Block title="Gérer les catégories">
        <QuizCategoryManager
          categories={categories}
          onCreated={(category) =>
            setCategories((current) => mergeQuizCategories([...current, category]))
          }
          onUpdated={updateCategory}
          onDelete={deleteCategory}
        />
      </Block>

      <Block title="Gérer les questions">
        <QuizQuestionList
          refreshKey={refreshKey}
          categories={categories}
          onEdit={(q) => { setEditing(q); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDelete={setToDelete}
        />
      </Block>

      <Block title="Import / Export">
        <QuizImportExport categories={categories} onImported={refresh} />
      </Block>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.question}</AlertDialogDescription>
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