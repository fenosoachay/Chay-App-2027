import React, { useEffect, useRef, useState } from "react";
import { Download, FileUp, Loader2, Pencil, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import initialMessages from "@/data/block-blast-messages.json";
import {
  BLOCK_BLAST_CATEGORIES,
  exportBlockBlastCsv,
  parseBlockBlastCsv,
  validateBlockBlastMessages,
} from "@/lib/blockBlast";
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

const CATEGORY_LABELS = {
  line_completed: "Ligne complétée",
  column_completed: "Colonne complétée",
  multiple_lines: "Plusieurs lignes ou colonnes",
  score_milestone: "Palier de score",
  new_record: "Nouveau record",
  game_over: "Fin de partie",
  general: "Général",
};
const INPUT = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const EMPTY_FORM = { id: "", category: "general", message: "", active: true };

async function loadMessages() {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities.BlockBlastMessage.filter(
      {},
      { sort: "message_id", limit: 200, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all.map((item) => ({
    ...item,
    id: item.message_id,
    recordId: item.id,
    active: Boolean(item.active),
  }));
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

export default function BlockBlastMessagesAdminPanel() {
  const { toast } = useToast();
  const importRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState(null);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [importMode, setImportMode] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const reload = async () => setMessages(await loadMessages());

  useEffect(() => {
    reload().catch((error) => toast({
      title: "Impossible de charger les messages",
      description: error?.message || "Vérifie que l'entité BlockBlastMessage est publiée.",
      variant: "destructive",
    })).finally(() => setLoading(false));
  }, []);

  const categoryCounts = BLOCK_BLAST_CATEGORIES.map((category) => ({
    category,
    active: messages.filter((message) => message.active && message.category === category).length,
    total: messages.filter((message) => message.category === category).length,
  }));

  const seedInitialMessages = async () => {
    if (messages.length) {
      toast({ title: "La bibliothèque contient déjà des messages", description: "L'ajout initial est disponible uniquement lorsque la bibliothèque est vide." });
      return;
    }
    setSaving(true);
    try {
      const validated = validateBlockBlastMessages(initialMessages);
      if (validated.errors.length) throw new Error(validated.errors.join(" "));
      await base44.entities.BlockBlastMessage.bulkCreate(validated.messages.map((item) => ({
        message_id: item.id,
        category: item.category,
        message: item.message,
        active: item.active,
      })));
      await reload();
      toast({ title: "Bibliothèque initialisée", description: `${validated.messages.length} messages ajoutés.` });
    } catch (error) {
      toast({ title: "Initialisation impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const normalized = {
      id: editing?.id || form.id.trim() || `msg_${Date.now().toString(36)}`,
      category: form.category,
      message: form.message.trim(),
      active: form.active,
    };
    const checked = validateBlockBlastMessages([normalized]);
    const duplicate = messages.some((item) => item.id === normalized.id && item.id !== editing?.id);
    if (checked.errors.length || duplicate) {
      toast({
        title: duplicate ? "Identifiant déjà utilisé" : "Message invalide",
        description: duplicate ? "Choisis un identifiant unique." : checked.errors.join(" "),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const record = {
        message_id: normalized.id,
        category: normalized.category,
        message: normalized.message,
        active: normalized.active,
      };
      if (editing) await base44.entities.BlockBlastMessage.update(editing.recordId, record);
      else await base44.entities.BlockBlastMessage.create(record);
      setEditing(null);
      setForm(EMPTY_FORM);
      await reload();
      toast({ title: editing ? "Message modifié" : "Message ajouté" });
    } catch (error) {
      toast({ title: "Enregistrement impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const edit = (message) => {
    setEditing(message);
    setForm({ id: message.id, category: message.category, message: message.message, active: message.active });
    document.getElementById("block-blast-message-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleActive = async (message) => {
    try {
      await base44.entities.BlockBlastMessage.update(message.recordId, {
        message_id: message.id,
        category: message.category,
        message: message.message,
        active: !message.active,
      });
      await reload();
    } catch (error) {
      toast({ title: "Modification impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await base44.entities.BlockBlastMessage.delete(deleteTarget.recordId);
      setDeleteTarget(null);
      await reload();
      toast({ title: "Message supprimé" });
    } catch (error) {
      toast({ title: "Suppression impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    }
  };

  const readImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const raw = file.name.toLowerCase().endsWith(".csv")
        ? parseBlockBlastCsv(text)
        : JSON.parse(text);
      const validated = validateBlockBlastMessages(raw, {
        idFactory: (index) => `msg_${Date.now().toString(36)}_${index + 1}`,
      });
      setPreview({ filename: file.name, messages: validated.messages });
      setPreviewErrors(validated.errors);
    } catch (error) {
      setPreview(null);
      setPreviewErrors([error?.message || "Le fichier ne peut pas être lu."]);
    }
  };

  const applyImport = async () => {
    if (!preview || !importMode || previewErrors.length) return;
    if (importMode === "append") {
      const existingIds = new Set(messages.map((message) => message.id));
      const duplicates = preview.messages.filter((message) => existingIds.has(message.id));
      if (duplicates.length) {
        setPreviewErrors(duplicates.map((message) => `L'identifiant « ${message.id} » existe déjà; il ne sera pas écrasé en mode ajout.`));
        setImportMode("");
        return;
      }
    }
    setSaving(true);
    try {
      const incomingIds = new Set(preview.messages.map((message) => message.id));
      if (importMode === "replace") {
        const existingById = new Map(messages.map((message) => [message.id, message]));
        for (const message of preview.messages) {
          const record = {
            message_id: message.id,
            category: message.category,
            message: message.message,
            active: message.active,
          };
          const existing = existingById.get(message.id);
          if (existing) await base44.entities.BlockBlastMessage.update(existing.recordId, record);
          else await base44.entities.BlockBlastMessage.create(record);
        }
        for (const existing of messages) {
          if (!incomingIds.has(existing.id)) await base44.entities.BlockBlastMessage.delete(existing.recordId);
        }
      } else {
        await base44.entities.BlockBlastMessage.bulkCreate(preview.messages.map((message) => ({
          message_id: message.id,
          category: message.category,
          message: message.message,
          active: message.active,
        })));
      }
      setImportMode("");
      setPreview(null);
      setPreviewErrors([]);
      await reload();
      toast({
        title: importMode === "replace" ? "Bibliothèque remplacée" : "Messages ajoutés",
        description: `${preview.messages.length} message(s) traité(s).`,
      });
    } catch (error) {
      toast({ title: "Import incomplet", description: error?.message || "Recharge la page pour vérifier la bibliothèque.", variant: "destructive" });
      await reload().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const exportJson = () => downloadFile(
    "block-blast-messages.json",
    JSON.stringify(messages.map(({ id, category, message, active }) => ({ id, category, message, active })), null, 2),
    "application/json"
  );
  const exportCsv = () => downloadFile(
    "block-blast-messages.csv",
    exportBlockBlastCsv(messages),
    "text/csv;charset=utf-8"
  );

  if (loading) return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm leading-relaxed text-foreground/70">
          Les messages sont du texte brut, affiché sans exécuter de contenu HTML ou JavaScript. Les messages actifs sont visibles pour les joueurs; seule l'administration peut les modifier.
        </p>
        {!messages.length && (
          <button type="button" onClick={seedInitialMessages} disabled={saving} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Charger les messages de départ
          </button>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {categoryCounts.map(({ category, active, total }) => (
          <div key={category} className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-bold leading-tight">{CATEGORY_LABELS[category]}</p>
            <p className="mt-2 text-sm"><strong>{active}</strong><span className="text-foreground/50"> actifs · {total} au total</span></p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
        <h3 className="mb-4 text-lg font-extrabold">{editing ? "Modifier un message" : "Ajouter un message"}</h3>
        <form id="block-blast-message-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Identifiant (facultatif)">
              <input className={INPUT} value={form.id} disabled={Boolean(editing)} placeholder="Généré automatiquement" onChange={(event) => setForm({ ...form, id: event.target.value })} />
            </Field>
            <Field label="Catégorie">
              <select className={INPUT} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {BLOCK_BLAST_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Actif
            </label>
          </div>
          <Field label="Texte du message">
            <textarea required maxLength={1000} rows={3} className={INPUT} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editing ? "Enregistrer" : "Ajouter"}
            </button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY_FORM); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-bold"><X className="h-4 w-4" /> Annuler</button>}
          </div>
        </form>
      </section>

      <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
        <h3 className="mb-4 text-lg font-extrabold">Messages enregistrés ({messages.length})</h3>
        {messages.length ? (
          <div className="space-y-2">
            {messages.map((message) => (
              <article key={message.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{CATEGORY_LABELS[message.category]}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${message.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-foreground/50"}`}>{message.active ? "Actif" : "Inactif"}</span>
                    <span className="text-xs text-foreground/40">{message.id}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.message}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => toggleActive(message)} className="rounded-full border border-border px-3 py-2 text-xs font-bold">{message.active ? "Désactiver" : "Activer"}</button>
                  <button type="button" onClick={() => edit(message)} aria-label="Modifier le message" className="rounded-full border border-border p-2.5"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setDeleteTarget(message)} aria-label="Supprimer le message" className="rounded-full border border-destructive/30 p-2.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-foreground/55">Aucun message enregistré.</p>}
      </section>

      <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
        <h3 className="text-lg font-extrabold">Import et export</h3>
        <p className="mb-4 mt-2 text-sm text-foreground/65">Les imports sont validés et prévisualisés. En mode ajout, aucun message existant n'est écrasé.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportJson} disabled={!messages.length} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold disabled:opacity-50"><Download className="h-4 w-4" /> Exporter JSON</button>
          <button type="button" onClick={exportCsv} disabled={!messages.length} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold disabled:opacity-50"><Download className="h-4 w-4" /> Exporter CSV</button>
          <button type="button" onClick={() => importRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"><Upload className="h-4 w-4" /> Importer JSON / CSV</button>
          <input ref={importRef} className="hidden" type="file" accept=".json,.csv,application/json,text/csv" onChange={readImport} />
        </div>
        {preview && (
          <div className="mt-4 space-y-3 rounded-2xl border border-border bg-background p-4">
            <div>
              <h4 className="font-extrabold">Aperçu : {preview.filename}</h4>
              <p className="mt-1 text-sm text-foreground/65">{preview.messages.length} message(s) valide(s)</p>
            </div>
            {!!previewErrors.length && <ul className="space-y-1 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{previewErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
            <div className="max-h-64 space-y-2 overflow-auto">
              {preview.messages.map((message) => (
                <p key={`${message.id}-${message.category}`} className="rounded-xl border border-border p-3 text-sm">
                  <strong>{message.id} · {CATEGORY_LABELS[message.category]}</strong>
                  <span className="mt-1 block whitespace-pre-wrap">{message.message}</span>
                </p>
              ))}
            </div>
            {!previewErrors.length && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setImportMode("append")} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"><FileUp className="h-4 w-4" /> Ajouter les messages</button>
                <button type="button" onClick={() => setImportMode("replace")} className="min-h-10 rounded-full border border-destructive/40 px-4 text-sm font-bold text-destructive">Remplacer la bibliothèque</button>
              </div>
            )}
          </div>
        )}
      </section>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
            <AlertDialogDescription>« {deleteTarget?.message} » sera retiré de la bibliothèque.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(importMode)} onOpenChange={(open) => { if (!open) setImportMode(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{importMode === "replace" ? "Remplacer toute la bibliothèque ?" : "Ajouter les messages importés ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {importMode === "replace"
                ? "Les messages absents du fichier seront supprimés. Les messages portant un identifiant présent dans les deux listes seront mis à jour."
                : "Les messages seront ajoutés sans modifier ceux déjà enregistrés. L'import sera refusé si des identifiants existent déjà."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={applyImport} disabled={saving} className={importMode === "replace" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
