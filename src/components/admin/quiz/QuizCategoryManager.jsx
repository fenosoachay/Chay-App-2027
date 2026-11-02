import React, { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { quizCategoryValue } from "@/lib/quizCategories";

export default function QuizCategoryManager({ categories, onCreated }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Créez des catégories qui seront disponibles pour classer les questions et exportées dans le JSON du quiz.
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
      <ul className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <li
            key={category.value}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground/70"
          >
            {category.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
