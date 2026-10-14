import React, { useState } from "react";
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
  const refresh = () => setRefreshKey((k) => k + 1);

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
        <WsWordForm key={editing?.id || "new"} initial={editing} saving={saving} onSave={save} onCancel={editing ? () => setEditing(null) : undefined} />
      </Block>

      <Block title="Liste des mots">
        <WsWordList
          refreshKey={refreshKey}
          onEdit={(w) => { setEditing(w); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDelete={setToDelete}
          onPreview={setPreview}
        />
      </Block>

      <Block title="Import / Export"><WsImportExport onImported={refresh} /></Block>

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