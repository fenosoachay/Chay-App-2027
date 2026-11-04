import React, { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, Pencil, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const EMPTY_FORM = { title: "", description: "", is_active: true };

function extensionOf(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

async function validateImage(file) {
  if (!file) throw new Error("Choisissez une image.");
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("L'image doit peser au maximum 10 Mo.");
  }
  if (!ACCEPTED_EXTENSIONS.has(extensionOf(file.name))) {
    throw new Error("Formats acceptés : JPG, JPEG, PNG et WEBP.");
  }
  if (file.type && !ACCEPTED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Le type MIME de cette image n'est pas accepté.");
  }

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("Le contenu du fichier ne correspond pas à une image JPG, PNG ou WEBP.");
  }

  let sha256;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new Error("La validation sécurisée de l'image n'est pas disponible dans ce navigateur.");
  }
  return sha256;
}

async function getAllPuzzles() {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities.PuzzleImage.filter(
      {},
      { sort: "-created_date", limit: 100, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

function Block({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
      <h3 className="mb-3 text-lg font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

export default function PuzzleAdminPanel() {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [toDelete, setToDelete] = useState(null);

  const loadPuzzles = async () => {
    setLoading(true);
    try {
      setPuzzles(await getAllPuzzles());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPuzzles().catch((error) => toast({
      title: "Impossible de charger les puzzles",
      description: error?.message || "Réessayez.",
      variant: "destructive",
    }));
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(editing?.image_url || "");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, editing]);

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const selectForEdit = (puzzle) => {
    setEditing(puzzle);
    setForm({
      title: puzzle.title || "",
      description: puzzle.description || "",
      is_active: Boolean(puzzle.is_active),
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!editing && !file) {
      toast({ title: "Image requise", description: "Choisissez une image pour ce puzzle.", variant: "destructive" });
      return;
    }

    setSaving(true);
    let uploadedUrl = "";
    try {
      let imageUrl = editing?.image_url || "";
      let imageSha256 = editing?.image_sha256 || "";
      let imageHistory = editing?.image_history || [];

      if (file) {
        imageSha256 = await validateImage(file);
        const duplicate = puzzles.find((puzzle) => (
          puzzle.id !== editing?.id &&
          !puzzle.is_deleted &&
          puzzle.image_sha256 === imageSha256
        ));
        if (duplicate) {
          throw new Error(`Cette image est déjà utilisée par « ${duplicate.title} ».`);
        }
        uploadedUrl = await uploadToBase44(file);
        if (imageUrl && imageUrl !== uploadedUrl) {
          imageHistory = [...new Set([...imageHistory, imageUrl])];
        }
        imageUrl = uploadedUrl;
      }

      const data = {
        title,
        image_url: imageUrl,
        image_history: imageHistory,
        image_sha256: imageSha256,
        description: form.description.trim(),
        is_active: Boolean(form.is_active),
        is_deleted: false,
      };
      if (editing) {
        await base44.entities.PuzzleImage.update(editing.id, data);
        toast({ title: editing.is_deleted ? "Puzzle restauré" : "Puzzle modifié" });
      } else {
        await base44.entities.PuzzleImage.create(data);
        toast({ title: "Puzzle ajouté" });
      }
      resetForm();
      await loadPuzzles();
    } catch (error) {
      toast({
        title: "Enregistrement impossible",
        description: uploadedUrl
          ? `${error?.message || "Réessayez."} L'image a été téléversée, mais n'a pas pu être associée à un puzzle.`
          : error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!toDelete) return;
    try {
      await base44.entities.PuzzleImage.update(toDelete.id, {
        is_active: false,
        is_deleted: true,
        image_history: toDelete.image_history || [],
      });
      setToDelete(null);
      toast({ title: "Puzzle supprimé de la galerie" });
      await loadPuzzles();
    } catch (error) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    }
  };

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="space-y-5">
      <Block title={editing ? "Modifier un puzzle" : "Ajouter un puzzle"}>
        <p className="mb-4 text-sm text-foreground/60">
          Ajoutez une image et ses informations. Les fichiers sont stockés via le service d'upload Base44, jamais dans la base sous forme Base64.
        </p>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-foreground/70">Titre *</span>
              <input
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                className={INPUT_CLASS}
                maxLength={120}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-foreground/70">
                Image {editing ? "(facultatif, remplacer)" : "*"}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className={`${INPUT_CLASS} file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:font-bold`}
              />
              <span className="mt-1 block text-xs text-foreground/50">JPG, JPEG, PNG ou WEBP · 10 Mo maximum</span>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-foreground/70">Description (facultative)</span>
            <textarea
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              className={INPUT_CLASS}
              rows={3}
              maxLength={500}
            />
          </label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setField("is_active", event.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Puzzle actif et visible dans le jeu
          </label>

          {previewUrl && (
            <div className="max-w-md rounded-xl border border-border bg-card p-2">
              <p className="mb-2 text-xs font-bold text-foreground/60">Aperçu avant publication</p>
              <img src={previewUrl} alt={`Aperçu de ${form.title || "l'image du puzzle"}`} className="max-h-64 w-full rounded-lg object-contain" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Upload className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter le puzzle"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold">
                <X className="h-4 w-4" /> Annuler
              </button>
            )}
          </div>
        </form>
      </Block>

      <Block title={`Puzzles enregistrés (${puzzles.filter((puzzle) => !puzzle.is_deleted).length})`}>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>
        ) : puzzles.length ? (
          <ul className="space-y-2">
            {puzzles.map((puzzle) => (
              <li key={puzzle.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
                <div className="h-20 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-28">
                  {puzzle.image_url ? (
                    <img src={puzzle.image_url} alt={puzzle.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-foreground/35"><ImageOff className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{puzzle.title}</p>
                  {puzzle.description && <p className="mt-1 line-clamp-2 text-sm text-foreground/55">{puzzle.description}</p>}
                  <span className={`mt-1 inline-block text-xs font-bold ${puzzle.is_deleted ? "text-foreground/45" : puzzle.is_active ? "text-emerald-600" : "text-amber-600"}`}>
                    {puzzle.is_deleted ? "Archivé" : puzzle.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                {puzzle.is_deleted ? (
                  <button type="button" onClick={() => selectForEdit(puzzle)} aria-label={`Restaurer ${puzzle.title}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:bg-muted">
                    <RotateCcw className="h-4 w-4" /> Restaurer
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => selectForEdit(puzzle)} aria-label={`Modifier ${puzzle.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setToDelete(puzzle)} aria-label={`Supprimer ${puzzle.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-foreground/50">Aucun puzzle n'est enregistré.</p>
        )}
        <p className="mt-4 text-xs text-foreground/50">
          La suppression retire le puzzle du jeu et l'archive pour conserver la référence à son image. Base44 ne fournit pas ici d'action de suppression physique des fichiers stockés.
        </p>
      </Block>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce puzzle de la galerie ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {toDelete?.title} » ne sera plus visible dans le jeu. Son enregistrement sera archivé afin de conserver la référence à l'image stockée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              archive();
            }}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
