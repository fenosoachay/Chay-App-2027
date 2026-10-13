import React, { useState } from "react";
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

function Block({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
      <h3 className="font-display font-extrabold text-lg mb-3">{title}</h3>
      {children}
    </section>
  );
}

export default function QuizAdminPanel() {
  const { toast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const refresh = () => setRefreshKey((k) => k + 1);

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
          onSave={save}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </Block>

      <Block title="Gérer les questions">
        <QuizQuestionList
          refreshKey={refreshKey}
          onEdit={(q) => { setEditing(q); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDelete={setToDelete}
        />
      </Block>

      <Block title="Import / Export"><QuizImportExport onImported={refresh} /></Block>

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