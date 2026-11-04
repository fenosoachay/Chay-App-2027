import React, { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import initialQuiz from "@/data/emojis-quiz.json";
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

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const EMPTY_QUESTION = {
  emojis: "",
  answer: "",
  options: ["", "", "", ""],
  hint: "",
  difficulty: "easy",
  category: "",
};

function cleanQuestion(question) {
  if (!question || typeof question !== "object") return null;
  const options = Array.isArray(question.options)
    ? question.options.slice(0, 4).map((option) => String(option || "").trim())
    : [];
  if (
    options.length !== 4 ||
    options.some((option) => !option) ||
    new Set(options).size !== 4 ||
    !options.includes(String(question.answer || "").trim()) ||
    !String(question.emojis || "").trim() ||
    !String(question.hint || "").trim() ||
    !String(question.category || "").trim() ||
    !["easy", "medium", "hard"].includes(question.difficulty)
  ) return null;

  return {
    emojis: String(question.emojis).trim(),
    answer: String(question.answer).trim(),
    options,
    hint: String(question.hint).trim(),
    difficulty: question.difficulty,
    category: String(question.category).trim(),
  };
}

async function getAllQuestions() {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities.EmojiQuizQuestion.filter(
      {},
      { sort: "created_date", limit: 200, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

function Block({ title, children }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5">
      <h3 className="mb-3 text-lg font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

export default function EmojisAdminPanel() {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_QUESTION);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadQuestions = async () => {
    const all = await getAllQuestions();
    setQuestions(all);
    setLoading(false);
  };

  useEffect(() => {
    loadQuestions().catch((error) => {
      setLoading(false);
      toast({
        title: "Impossible de charger les énigmes",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    });
  }, []);

  const resetForm = () => {
    setForm(EMPTY_QUESTION);
    setEditing(null);
  };

  const save = async (event) => {
    event.preventDefault();
    const data = cleanQuestion(form);
    if (!data) {
      toast({
        title: "Énigme incomplète",
        description: "Vérifiez les émojis, les quatre choix, la bonne réponse, l'indice, le niveau et la catégorie.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await base44.entities.EmojiQuizQuestion.update(editing.id, data);
        toast({ title: "Énigme modifiée" });
      } else {
        await base44.entities.EmojiQuizQuestion.create(data);
        toast({ title: "Énigme ajoutée" });
      }
      resetForm();
      await loadQuestions();
    } catch (error) {
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const edit = (question) => {
    setEditing(question);
    setForm({
      emojis: question.emojis || "",
      answer: question.answer || "",
      options: Array.from({ length: 4 }, (_, index) => question.options?.[index] || ""),
      hint: question.hint || "",
      difficulty: question.difficulty || "easy",
      category: question.category || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeQuestion = async () => {
    if (!deleteTarget) return;
    try {
      await base44.entities.EmojiQuizQuestion.delete(deleteTarget.id);
      setDeleteTarget(null);
      toast({ title: "Énigme supprimée" });
      await loadQuestions();
    } catch (error) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    }
  };

  const seedDefaults = async () => {
    if (questions.length) return;
    setSeeding(true);
    try {
      const defaults = initialQuiz.questions.map(cleanQuestion).filter(Boolean);
      if (defaults.length !== initialQuiz.questions.length) {
        throw new Error("Le fichier initial contient une énigme invalide.");
      }
      await base44.entities.EmojiQuizQuestion.bulkCreate(defaults);
      toast({ title: `${defaults.length} énigmes ajoutées` });
      await loadQuestions();
    } catch (error) {
      toast({
        title: "Initialisation impossible",
        description: error?.message || "Réessayez.",
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(list)) throw new Error("Le fichier ne contient pas de liste d'énigmes.");
      const valid = list.map(cleanQuestion).filter(Boolean);
      const skipped = list.length - valid.length;
      if (valid.length) await base44.entities.EmojiQuizQuestion.bulkCreate(valid);
      toast({
        title: `${valid.length} énigme(s) importée(s)`,
        description: skipped ? `${skipped} ligne(s) invalide(s) ignorée(s).` : undefined,
      });
      await loadQuestions();
    } catch (error) {
      toast({
        title: "Import impossible",
        description: error?.message || "Vérifiez le fichier JSON.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const exportJson = () => {
    const payload = {
      questions: questions.map(({ emojis, answer, options, hint, difficulty, category }) => ({
        emojis, answer, options, hint, difficulty, category,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "emojis-quiz.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setOption = (index, value) => setForm((current) => {
    const options = [...current.options];
    options[index] = value;
    return {
      ...current,
      options,
      answer: current.answer && options.includes(current.answer) ? current.answer : "",
    };
  });
  const categories = [...new Set(questions.map((question) => question.category).filter(Boolean))].sort();
  const visibleQuestions = questions.filter((question) => (
    (!difficultyFilter || question.difficulty === difficultyFilter) &&
    (!categoryFilter || question.category === categoryFilter) &&
    (!search || `${question.answer} ${question.emojis} ${question.hint}`.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")))
  ));

  return (
    <div className="space-y-5">
      <Block title="Gérer les énigmes">
        <p className="mb-4 text-sm text-foreground/60">
          Ajoutez, modifiez et supprimez les personnages du jeu. Ces énigmes sont celles proposées aux joueurs.
        </p>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Suite d'émojis *">
              <input value={form.emojis} onChange={(event) => setField("emojis", event.target.value)} className={INPUT_CLASS} placeholder="🐑👑🎵" required />
            </Field>
            <Field label="Catégorie *">
              <input value={form.category} onChange={(event) => setField("category", event.target.value)} className={INPUT_CLASS} placeholder="rois" required />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {form.options.map((option, index) => (
              <Field key={index} label={`Proposition ${index + 1} *`}>
                <input
                  value={option}
                  onChange={(event) => setOption(index, event.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </Field>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bonne réponse *">
              <select value={form.answer} onChange={(event) => setField("answer", event.target.value)} className={INPUT_CLASS} required>
                <option value="" disabled>Choisir la bonne réponse</option>
                {form.options.filter(Boolean).map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="Difficulté *">
              <select value={form.difficulty} onChange={(event) => setField("difficulty", event.target.value)} className={INPUT_CLASS}>
                <option value="easy">Facile</option>
                <option value="medium">Moyen</option>
                <option value="hard">Difficile</option>
              </select>
            </Field>
          </div>
          <Field label="Indice *">
            <textarea value={form.hint} onChange={(event) => setField("hint", event.target.value)} className={INPUT_CLASS} rows={2} required />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? "Enregistrer" : "Ajouter l'énigme"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold">
                <X className="h-4 w-4" /> Annuler
              </button>
            )}
          </div>
        </form>
      </Block>

      <Block title={`Questions du jeu (${questions.length})`}>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${INPUT_CLASS} pl-9`} placeholder="Rechercher un personnage…" />
          </div>
          <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} className={INPUT_CLASS}>
            <option value="">Tous les niveaux</option>
            <option value="easy">Facile</option>
            <option value="medium">Moyen</option>
            <option value="hard">Difficile</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={INPUT_CLASS}>
            <option value="">Toutes les catégories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></div>
        ) : visibleQuestions.length ? (
          <ul className="space-y-2">
            {visibleQuestions.map((question) => (
              <li key={question.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-3xl">{question.emojis}</p>
                  <p className="mt-1 text-sm font-bold">{question.answer}</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {question.category} · {question.difficulty} · {question.options?.length || 0} choix
                  </p>
                </div>
                <button type="button" onClick={() => edit(question)} aria-label={`Modifier ${question.answer}`} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-muted">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setDeleteTarget(question)} aria-label={`Supprimer ${question.answer}`} className="grid h-9 w-9 place-items-center rounded-full border border-border text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-foreground/50">
            {questions.length ? "Aucune énigme ne correspond à la recherche." : "Aucune énigme n'est enregistrée."}
          </p>
        )}

        {!loading && questions.length === 0 && (
          <button type="button" onClick={seedDefaults} disabled={seeding} className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50">
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <SparklesIcon />}
            Charger les 30 énigmes de départ
          </button>
        )}
      </Block>

      <Block title="Importer / exporter">
        <p className="mb-3 text-sm text-foreground/60">
          Importez un fichier JSON au format <code>{"{ questions: [...] }"}</code> ou exportez les énigmes gérées ici.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportJson} disabled={!questions.length || importing} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50">
            <Download className="h-4 w-4" /> Exporter JSON
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importer JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
        </div>
      </Block>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette énigme ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'énigme « {deleteTarget?.answer} » ne sera plus proposée dans le jeu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => {
              event.preventDefault();
              removeQuestion();
            }}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SparklesIcon() {
  return <span aria-hidden="true">✨</span>;
}
