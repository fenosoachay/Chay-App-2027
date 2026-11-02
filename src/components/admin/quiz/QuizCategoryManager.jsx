import React, { useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { quizCategoryValue } from "@/lib/quizCategories";
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

export default function QuizCategoryManager({ categories, onCreated, onUpdated, onDelete }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingValue, setEditingValue] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const fallbackLabel = categories.find((category) => category.value === "autre")?.label || "Autre";

  const createCategory = async (event) => {
    event.preventDefault();
    const name = label.trim();
    const value = quizCategoryValue(name);
    if (!name || !value) {
      toast({ title: "Nom de catégorie invalide", variant: "destructive" });
      return;
    }
    if (categories.some((category) => category.value === value)) {
      toast({ title: "Cette catégorie existe déjà", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const created = await base44.entities.QuizCategory.create({ value, label: name });
      onCreated(created);
      setLabel("");
      toast({ title: "Catégorie ajoutée" });
    } catch (error) {
      toast({
        title: "Impossible de créer la catégorie",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = async (event) => {
    event.preventDefault();
    const name = editingLabel.trim();
    if (!name) {
      toast({ title: "Le nom de la catégorie est obligatoire", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await onUpdated({ ...categories.find((category) => category.value === editingValue), label: name });
      setEditingValue(null);
      setEditingLabel("");
      toast({ title: "Catégorie modifiée" });
    } catch (error) {
      toast({
        title: "Impossible de modifier la catégorie",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await onDelete(toDelete);
      toast({ title: "Catégorie supprimée" });
      setToDelete(null);
    } catch (error) {
      toast({
        title: "Impossible de supprimer la catégorie",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Modifiez ou supprimez les catégories existantes, ou créez-en de nouvelles. Les questions d’une catégorie supprimée seront classées dans « {fallbackLabel} ».
      </p>
      <form onSubmit={createCategory} className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
          placeholder="Nom de la catégorie"
          aria-label="Nom de la nouvelle catégorie"
          className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={saving || !label.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter la catégorie
        </button>
      </form>
      <ul className="space-y-2">
        {categories.map((category) => (
          <li key={category.value} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
            {editingValue === category.value ? (
              <form onSubmit={saveLabel} className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={editingLabel}
                  onChange={(event) => setEditingLabel(event.target.value)}
                  maxLength={60}
                  aria-label={`Nom de la catégorie ${category.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button type="submit" disabled={saving || !editingLabel.trim()} aria-label="Enregistrer" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </button>
                <button type="button" disabled={saving} onClick={() => setEditingValue(null)} aria-label="Annuler" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 text-sm font-semibold">{category.label}</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditingValue(category.value);
                    setEditingLabel(category.label);
                  }}
                  aria-label={`Modifier ${category.label}`}
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={saving || category.value === "autre"}
                  onClick={() => setToDelete(category)}
                  aria-label={`Supprimer ${category.label}`}
                  title={category.value === "autre" ? `Cette catégorie est nécessaire pour classer les questions déplacées vers « ${fallbackLabel} »` : undefined}
                  className="grid h-9 w-9 place-items-center rounded-full text-destructive hover:bg-destructive/10 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {toDelete?.label} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les questions de cette catégorie seront réassignées à « {fallbackLabel} ». Cette action ne supprime aucune question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); deleteCategory(); }}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
