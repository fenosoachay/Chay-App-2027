import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Download, FileUp, Loader2, Pencil, Save, Trash2, Upload, Users, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { useToast } from "@/components/ui/use-toast";
import initialQuiz from "@/data/personality-quiz.json";
import {
  cleanPersonalityProfile,
  cleanPersonalityQuestion,
  exportPersonalityQuizCsv,
  parsePersonalityQuizCsv,
  validatePersonalityQuizPackage,
} from "@/lib/personalityQuiz";
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

const INPUT = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const EMPTY_QUESTION = {
  content_id: "", question: "", sort_order: 1, is_active: true,
  answers: Array.from({ length: 4 }, (_, index) => ({ id: `a${index + 1}`, text: "", scores: {} })),
};
const EMPTY_PROFILE = {
  content_id: "", name: "", sort_order: 1, is_active: true, image_url: "", summary: "",
  qualitiesText: "", growthText: "", story: "", reference: "",
};

async function getAll(entity) {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities[entity].filter(
      {},
      { sort: "sort_order", limit: 200, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children, className = "" }) {
  return (
    <section className={`rounded-[1.5rem] border border-border bg-background/40 p-4 md:p-5 ${className}`}>
      <h3 className="mb-4 text-lg font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function splitList(value) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

export default function PersonalityQuizAdminPanel() {
  const { toast } = useToast();
  const questionFileRef = useRef(null);
  const profileFileRef = useRef(null);
  const importFileRef = useRef(null);
  const [questions, setQuestions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [tab, setTab] = useState("questions");
  const [questionForm, setQuestionForm] = useState(EMPTY_QUESTION);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [profileDeleteTarget, setProfileDeleteTarget] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [importAction, setImportAction] = useState("");
  const [statsPeriod, setStatsPeriod] = useState("all");

  const reload = async () => {
    const [allQuestions, allProfiles, allResults] = await Promise.all([
      getAll("PersonalityQuizQuestion"),
      getAll("PersonalityQuizProfile"),
      getAll("PersonalityQuizResult"),
    ]);
    setQuestions(allQuestions);
    setProfiles(allProfiles);
    setResults(allResults);
  };

  useEffect(() => {
    reload().catch((error) => toast({
      title: "Impossible de charger le test",
      description: error?.message || "Vérifiez que les entités Base44 sont publiées.",
      variant: "destructive",
    })).finally(() => setLoading(false));
  }, []);

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [profiles]
  );

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      const currentQuestions = await getAll("PersonalityQuizQuestion");
      const currentProfiles = await getAll("PersonalityQuizProfile");
      const knownIds = new Set(currentProfiles.map((profile) => profile.content_id));
      const newProfiles = initialQuiz.profiles
        .map(cleanPersonalityProfile)
        .filter((profile) => profile && !knownIds.has(profile.content_id));
      if (newProfiles.length) {
        await base44.entities.PersonalityQuizProfile.bulkCreate(newProfiles);
      }

      const mergedProfileIds = [...knownIds, ...newProfiles.map((profile) => profile.content_id)];
      const existingQuestionIds = new Set(currentQuestions.map((question) => question.content_id));
      const newQuestions = initialQuiz.questions
        .map((question) => cleanPersonalityQuestion(question, mergedProfileIds))
        .filter((question) => question && !existingQuestionIds.has(question.content_id));
      if (newQuestions.length) {
        await base44.entities.PersonalityQuizQuestion.bulkCreate(newQuestions);
      }
      await reload();
      toast({ title: "Contenu initial chargé", description: `${newQuestions.length} questions et ${newProfiles.length} profils ajoutés sans remplacer le contenu existant.` });
    } catch (error) {
      toast({ title: "Initialisation impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const saveQuestion = async (event) => {
    event.preventDefault();
    const payload = {
      ...questionForm,
      content_id: (questionForm.content_id || makeId("question")).trim().toLowerCase(),
      sort_order: Number(questionForm.sort_order),
      answers: questionForm.answers.map((answer, index) => ({
        id: answer.id || `a${index + 1}`,
        text: answer.text,
        scores: Object.fromEntries(
          Object.entries(answer.scores || {})
            .map(([id, value]) => [id, Number(value)])
            .filter(([, value]) => Number.isInteger(value) && value >= 1 && value <= 5)
        ),
      })),
    };
    const cleaned = cleanPersonalityQuestion(payload, profiles.map((profile) => profile.content_id));
    const duplicate = questions.some((question) => question.content_id === cleaned?.content_id && question.id !== editingQuestion?.id);
    const activeProfileIds = new Set(activeProfiles.map((profile) => profile.content_id));
    const hasActiveScoreForEachAnswer = cleaned?.answers.every((answer) => (
      Object.keys(answer.scores).some((profileId) => activeProfileIds.has(profileId))
    ));
    if (!cleaned || duplicate || !hasActiveScoreForEachAnswer) {
      toast({
        title: duplicate ? "Identifiant déjà utilisé" : "Question incomplète",
        description: duplicate
          ? "Choisis un identifiant unique."
          : !hasActiveScoreForEachAnswer
            ? "Chaque réponse doit attribuer des points à au moins un profil actif."
            : "Ajoute une question, quatre réponses et au moins un score valide par réponse.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (editingQuestion) await base44.entities.PersonalityQuizQuestion.update(editingQuestion.id, cleaned);
      else await base44.entities.PersonalityQuizQuestion.create(cleaned);
      setEditingQuestion(null);
      setQuestionForm({ ...EMPTY_QUESTION, content_id: "", sort_order: questions.length + 1 });
      await reload();
      toast({ title: editingQuestion ? "Question modifiée" : "Question ajoutée" });
    } catch (error) {
      toast({ title: "Enregistrement impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const editQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      content_id: question.content_id,
      question: question.question,
      sort_order: question.sort_order,
      is_active: question.is_active,
      answers: Array.from({ length: 4 }, (_, index) => ({
        id: question.answers?.[index]?.id || `a${index + 1}`,
        text: question.answers?.[index]?.text || "",
        scores: question.answers?.[index]?.scores || {},
      })),
    });
    document.getElementById("personality-question-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const editProfile = (profile) => {
    setEditingProfile(profile);
    setProfileFile(null);
    setProfileForm({
      ...profile,
      qualitiesText: profile.qualities.join("\n"),
      growthText: profile.growth_areas.join("\n"),
    });
    document.getElementById("personality-profile-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    let imageUrl = editingProfile?.image_url || "";
    let imageHistory = editingProfile?.image_history || [];
    if (profileFile) {
      const ext = profileFile.name.split(".").pop()?.toLowerCase();
      const bytes = new Uint8Array(await profileFile.slice(0, 12).arrayBuffer());
      const mime = profileFile.type.toLowerCase();
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
      const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      const matchesType = (mime === "image/jpeg" && isJpeg)
        || (mime === "image/png" && isPng)
        || (mime === "image/webp" && isWebp);
      if (!["jpg", "jpeg", "png", "webp"].includes(ext)
        || !["image/jpeg", "image/png", "image/webp"].includes(mime)
        || !matchesType
        || profileFile.size <= 0
        || profileFile.size > MAX_IMAGE_SIZE) {
        toast({ title: "Image invalide", description: "Utilise un fichier JPG, PNG ou WEBP de 10 Mo maximum.", variant: "destructive" });
        return;
      }
    }
    const raw = {
      ...profileForm,
      content_id: (profileForm.content_id || makeId("profil")).trim().toLowerCase(),
      sort_order: Number(profileForm.sort_order),
      qualities: splitList(profileForm.qualitiesText),
      growth_areas: splitList(profileForm.growthText),
      image_url: imageUrl,
    };
    const cleaned = cleanPersonalityProfile(raw);
    const duplicate = profiles.some((profile) => profile.content_id === cleaned?.content_id && profile.id !== editingProfile?.id);
    if (!cleaned || duplicate) {
      toast({
        title: duplicate ? "Identifiant déjà utilisé" : "Profil incomplet",
        description: duplicate ? "Choisis un identifiant unique." : "Complète le nom, le résumé, les qualités, les axes, l'histoire et la référence biblique.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (profileFile) {
        imageUrl = await uploadToBase44(profileFile);
        if (editingProfile?.image_url && editingProfile.image_url !== imageUrl) {
          imageHistory = [...new Set([...imageHistory, editingProfile.image_url])].slice(-20);
        }
      }
      const payload = { ...cleaned, image_url: imageUrl, image_history: imageHistory };
      if (editingProfile) await base44.entities.PersonalityQuizProfile.update(editingProfile.id, payload);
      else await base44.entities.PersonalityQuizProfile.create(payload);
      setEditingProfile(null);
      setProfileFile(null);
      setProfileForm({ ...EMPTY_PROFILE, sort_order: profiles.length + 1 });
      if (profileFileRef.current) profileFileRef.current.value = "";
      await reload();
      toast({ title: editingProfile ? "Profil modifié" : "Profil ajouté" });
    } catch (error) {
      toast({ title: "Enregistrement impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (entity, record) => {
    try {
      await base44.entities[entity].update(record.id, { is_active: !record.is_active });
      await reload();
    } catch (error) {
      toast({ title: "Modification impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    }
  };

  const removeQuestion = async () => {
    if (!deleteTarget) return;
    try {
      await base44.entities.PersonalityQuizQuestion.delete(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
      toast({ title: "Question supprimée" });
    } catch (error) {
      toast({ title: "Suppression impossible", description: error?.message || "Réessaie.", variant: "destructive" });
    }
  };

  const removeProfile = async () => {
    if (!profileDeleteTarget) return;
    const remainingActive = activeProfiles.filter((profile) => profile.id !== profileDeleteTarget.id);
    if (!remainingActive.length) {
      toast({ title: "Suppression impossible", description: "Garde au moins un profil actif ou active un autre profil avant de supprimer celui-ci.", variant: "destructive" });
      setProfileDeleteTarget(null);
      return;
    }
    const replacementProfileId = remainingActive[0].content_id;
    try {
      for (const question of questions) {
        let changed = false;
        const answers = question.answers.map((answer) => {
          if (!Object.hasOwn(answer.scores || {}, profileDeleteTarget.content_id)) return answer;
          changed = true;
          const scores = { ...answer.scores };
          delete scores[profileDeleteTarget.content_id];
          if (!Object.keys(scores).length) scores[replacementProfileId] = 1;
          return { ...answer, scores };
        });
        if (changed) {
          await base44.entities.PersonalityQuizQuestion.update(question.id, {
            content_id: question.content_id,
            sort_order: question.sort_order,
            is_active: question.is_active,
            question: question.question,
            answers,
          });
        }
      }
      await base44.entities.PersonalityQuizProfile.delete(profileDeleteTarget.id);
      setProfileDeleteTarget(null);
      await reload();
      toast({ title: "Profil supprimé", description: "Les points qui lui étaient exclusivement attribués ont été réassignés au premier profil actif." });
    } catch (error) {
      toast({ title: "Suppression incomplète", description: error?.message || "Recharge le panneau et vérifie les scores des questions.", variant: "destructive" });
      await reload().catch(() => {});
    }
  };

  const exportJson = () => downloadFile(
    "personality-quiz.json",
    JSON.stringify({
      title: "Quel personnage biblique te ressemble le plus ?",
      language: "fr",
      questions: questions.map(({ content_id, sort_order, is_active, question, answers }) => ({ content_id, sort_order, is_active, question, answers })),
      profiles: profiles.map(({ content_id, sort_order, is_active, name, image_url, image_history, summary, qualities, growth_areas, story, reference }) => ({ content_id, sort_order, is_active, name, image_url, image_history, summary, qualities, growth_areas, story, reference })),
    }, null, 2),
    "application/json"
  );
  const exportCsv = () => downloadFile(
    "personality-quiz.csv",
    exportPersonalityQuizCsv({ questions, profiles }),
    "text/csv;charset=utf-8"
  );

  const readImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? parsePersonalityQuizCsv(text)
        : JSON.parse(text);
      const validated = validatePersonalityQuizPackage(
        parsed,
        profiles.map((profile) => profile.content_id)
      );
      const errors = [...validated.errors];
      if (validated.questions.filter((question) => question.is_active).length < 10) {
        errors.push("Le paquet doit fournir au moins dix questions actives.");
      }
      if (!validated.profiles.some((profile) => profile.is_active) && !profiles.some((profile) => profile.is_active)) {
        errors.push("Le paquet doit fournir au moins un profil actif.");
      }
      if (!validated.questions.length || !validated.profiles.length) {
        errors.push("Pour importer, le paquet doit contenir au moins une question et un profil.");
      }
      setImportPreview({ ...validated, filename: file.name });
      setImportErrors(errors);
    } catch (error) {
      setImportPreview(null);
      setImportErrors([error?.message || "Le fichier ne peut pas être lu."]);
    }
  };

  const importData = async () => {
    if (!importPreview || !importAction || importErrors.length) return;
    const replace = importAction === "replace";
    const currentQuestions = questions;
    const currentProfiles = profiles;
    const importedQuestionIds = new Set(importPreview.questions.map((question) => question.content_id));
    const importedProfileIds = new Set(importPreview.profiles.map((profile) => profile.content_id));
    if (!replace) {
      const duplicateQuestion = currentQuestions.some((item) => importedQuestionIds.has(item.content_id));
      const duplicateProfile = currentProfiles.some((item) => importedProfileIds.has(item.content_id));
      if (duplicateQuestion || duplicateProfile) {
        setImportErrors(["Au moins un identifiant existe déjà. Choisis « Remplacer » ou modifie les identifiants avant l'import."]);
        setImportAction("");
        return;
      }
    } else {
      const strict = validatePersonalityQuizPackage(importPreview, []);
      if (strict.errors.length) {
        setImportErrors(strict.errors);
        setImportAction("");
        return;
      }
    }
    const importProfiles = replace
      ? importPreview.profiles
      : [...profiles, ...importPreview.profiles];
    const activeProfileIds = new Set(importProfiles.filter((profile) => profile.is_active).map((profile) => profile.content_id));
    const invalidScoring = importPreview.questions.some((question) => question.answers.some((answer) => (
      !Object.keys(answer.scores).some((profileId) => activeProfileIds.has(profileId))
    )));
    if (invalidScoring) {
      setImportErrors(["Chaque réponse doit attribuer des points à au moins un profil actif après l'import."]);
      setImportAction("");
      return;
    }

    setSaving(true);
    try {
      if (replace) {
        await syncRecords(
          "PersonalityQuizProfile", currentProfiles, importPreview.profiles
        );
        await syncRecords(
          "PersonalityQuizQuestion", currentQuestions, importPreview.questions
        );
      } else {
        await base44.entities.PersonalityQuizProfile.bulkCreate(importPreview.profiles);
        await base44.entities.PersonalityQuizQuestion.bulkCreate(importPreview.questions);
      }
      setImportPreview(null);
      setImportErrors([]);
      setImportAction("");
      await reload();
      toast({ title: replace ? "Contenu remplacé" : "Contenu ajouté", description: `${importPreview.questions.length} questions et ${importPreview.profiles.length} profils traités.` });
    } catch (error) {
      toast({ title: "Import partiellement ou totalement échoué", description: error?.message || "Recharge le panneau pour vérifier les éléments enregistrés.", variant: "destructive" });
      await reload().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const syncRecords = async (entity, current, incoming) => {
    const byContentId = new Map(current.map((item) => [item.content_id, item]));
    for (const record of incoming) {
      const existing = byContentId.get(record.content_id);
      if (existing) await base44.entities[entity].update(existing.id, record);
      else await base44.entities[entity].create(record);
    }
    const incomingIds = new Set(incoming.map((record) => record.content_id));
    for (const existing of current) {
      if (!incomingIds.has(existing.content_id)) await base44.entities[entity].delete(existing.id);
    }
  };

  const filteredResults = useMemo(() => {
    if (statsPeriod === "all") return results;
    const days = Number(statsPeriod);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return results.filter((result) => new Date(result.completed_at).getTime() >= since);
  }, [results, statsPeriod]);
  const profileCounts = useMemo(() => {
    const counts = new Map(profiles.map((profile) => [profile.content_id, 0]));
    filteredResults.forEach((result) => counts.set(result.profile_id, (counts.get(result.profile_id) || 0) + 1));
    const rows = [...profiles]
      .map((profile) => ({ ...profile, count: counts.get(profile.content_id) || 0 }))
      .sort((a, b) => b.count - a.count || a.sort_order - b.sort_order);
    const removedCount = filteredResults.filter((result) => !counts.has(result.profile_id)).length;
    if (removedCount) rows.push({ content_id: "removed", name: "Profil supprimé", count: removedCount, sort_order: Number.MAX_SAFE_INTEGER });
    return rows;
  }, [filteredResults, profiles]);

  const updateAnswer = (index, key, value) => {
    setQuestionForm((form) => {
      const answers = [...form.answers];
      answers[index] = { ...answers[index], [key]: value };
      return { ...form, answers };
    });
  };
  const updateScore = (answerIndex, profileId, value) => {
    setQuestionForm((form) => {
      const answers = [...form.answers];
      const scores = { ...answers[answerIndex].scores };
      if (value === "") delete scores[profileId];
      else scores[profileId] = value;
      answers[answerIndex] = { ...answers[answerIndex], scores };
      return { ...form, answers };
    });
  };

  if (loading) {
    return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>;
  }

  const tabs = [
    ["questions", `Questions (${questions.length})`],
    ["profiles", `Profils (${profiles.length})`],
    ["stats", "Statistiques"],
    ["import", "Import / export"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/70">
          Configure les questions, les points et les profils. Les réponses individuelles restent privées; seules les tendances par profil sont affichées ici.
        </p>
        <button type="button" onClick={seedDefaults} disabled={seeding} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-bold hover:bg-muted disabled:opacity-60">
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Charger les contenus initiaux
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${tab === id ? "bg-primary text-primary-foreground" : "text-foreground/60 hover:bg-muted hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <div className="space-y-5">
          <Section title={editingQuestion ? "Modifier une question" : "Ajouter une question"} className="scroll-mt-20" >
            <form id="personality-question-form" onSubmit={saveQuestion} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Identifiant unique">
                  <input className={INPUT} value={questionForm.content_id} disabled={Boolean(editingQuestion)} placeholder="ex. q11" onChange={(event) => setQuestionForm({ ...questionForm, content_id: event.target.value })} />
                </Field>
                <Field label="Ordre">
                  <input className={INPUT} type="number" min="1" step="1" value={questionForm.sort_order} onChange={(event) => setQuestionForm({ ...questionForm, sort_order: event.target.value })} />
                </Field>
                <label className="flex items-center gap-3 self-end rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold">
                  <input type="checkbox" checked={questionForm.is_active} onChange={(event) => setQuestionForm({ ...questionForm, is_active: event.target.checked })} />
                  Question active
                </label>
              </div>
              <Field label="Question">
                <textarea required maxLength={500} rows={2} className={INPUT} value={questionForm.question} onChange={(event) => setQuestionForm({ ...questionForm, question: event.target.value })} />
              </Field>
              <div className="grid gap-4 lg:grid-cols-2">
                {questionForm.answers.map((answer, index) => (
                  <div key={answer.id} className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
                    <Field label={`Réponse ${index + 1}`}>
                      <textarea required maxLength={500} rows={2} className={INPUT} value={answer.text} onChange={(event) => updateAnswer(index, "text", event.target.value)} />
                    </Field>
                    <p className="text-xs font-bold text-foreground/60">Points par profil (0 à 5; laisser vide pour aucun point)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {profiles.map((profile) => (
                        <Field key={profile.content_id} label={profile.name}>
                          <input type="number" min="0" max="5" step="1" className={INPUT} value={answer.scores?.[profile.content_id] ?? ""} onChange={(event) => updateScore(index, profile.content_id, event.target.value)} />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!profiles.length && <p className="text-sm text-destructive">Ajoute d'abord les profils bibliques pour attribuer les points.</p>}
              <div className="flex flex-wrap gap-2">
                <button disabled={saving || !profiles.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editingQuestion ? "Enregistrer" : "Ajouter la question"}
                </button>
                {editingQuestion && <button type="button" onClick={() => { setEditingQuestion(null); setQuestionForm({ ...EMPTY_QUESTION, sort_order: questions.length + 1 }); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-bold"><X className="h-4 w-4" /> Annuler</button>}
              </div>
            </form>
          </Section>

          <Section title="Questions enregistrées">
            {questions.length ? (
              <div className="space-y-2">
                {[...questions].sort((a, b) => a.sort_order - b.sort_order).map((question) => (
                  <div key={question.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">#{question.sort_order}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${question.is_active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-foreground/55"}`}>{question.is_active ? "Active" : "Inactive"}</span>
                        <span className="text-xs text-foreground/45">{question.content_id}</span>
                      </div>
                      <p className="mt-2 font-semibold">{question.question}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => toggleActive("PersonalityQuizQuestion", question)} className="rounded-full border border-border px-3 py-2 text-xs font-bold">{question.is_active ? "Désactiver" : "Activer"}</button>
                      <button type="button" onClick={() => editQuestion(question)} aria-label="Modifier la question" className="rounded-full border border-border p-2.5"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteTarget(question)} aria-label="Supprimer la question" className="rounded-full border border-destructive/30 p-2.5 text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-foreground/55">Aucune question. Charge le contenu initial ou crée ta première question.</p>}
          </Section>
        </div>
      )}

      {tab === "profiles" && (
        <div className="space-y-5">
          <Section title={editingProfile ? "Modifier un profil" : "Ajouter un profil"}>
            <form id="personality-profile-form" onSubmit={saveProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Identifiant unique">
                  <input required disabled={Boolean(editingProfile)} className={INPUT} value={profileForm.content_id} placeholder="ex. david" onChange={(event) => setProfileForm({ ...profileForm, content_id: event.target.value })} />
                </Field>
                <Field label="Nom du personnage">
                  <input required maxLength={100} className={INPUT} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
                </Field>
                <Field label="Ordre d'affichage">
                  <input required type="number" min="1" step="1" className={INPUT} value={profileForm.sort_order} onChange={(event) => setProfileForm({ ...profileForm, sort_order: event.target.value })} />
                </Field>
              </div>
              <Field label="Résumé du profil">
                <textarea required maxLength={1200} rows={3} className={INPUT} value={profileForm.summary} onChange={(event) => setProfileForm({ ...profileForm, summary: event.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Qualités (une par ligne)">
                  <textarea required rows={4} className={INPUT} value={profileForm.qualitiesText} onChange={(event) => setProfileForm({ ...profileForm, qualitiesText: event.target.value })} />
                </Field>
                <Field label="Axes de progression (un par ligne)">
                  <textarea required rows={4} className={INPUT} value={profileForm.growthText} onChange={(event) => setProfileForm({ ...profileForm, growthText: event.target.value })} />
                </Field>
              </div>
              <Field label="Histoire biblique">
                <textarea required maxLength={2500} rows={4} className={INPUT} value={profileForm.story} onChange={(event) => setProfileForm({ ...profileForm, story: event.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Référence biblique (ex. Psaumes 27:1)">
                  <input required maxLength={120} className={INPUT} value={profileForm.reference} onChange={(event) => setProfileForm({ ...profileForm, reference: event.target.value })} />
                </Field>
                <Field label="Illustration (JPG, PNG ou WEBP · 10 Mo max)">
                  <input ref={profileFileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className={`${INPUT} file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-bold`} onChange={(event) => setProfileFile(event.target.files?.[0] || null)} />
                  {profileForm.image_url && <a className="mt-1 block truncate text-xs text-primary underline" href={profileForm.image_url} target="_blank" rel="noreferrer">Voir l'image actuelle</a>}
                </Field>
              </div>
              <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={profileForm.is_active} onChange={(event) => setProfileForm({ ...profileForm, is_active: event.target.checked })} /> Profil actif</label>
              <div className="flex flex-wrap gap-2">
                <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : profileFile ? <Upload className="h-4 w-4" /> : <Save className="h-4 w-4" />} {editingProfile ? "Enregistrer" : "Ajouter le profil"}
                </button>
                {editingProfile && <button type="button" onClick={() => { setEditingProfile(null); setProfileFile(null); setProfileForm({ ...EMPTY_PROFILE, sort_order: profiles.length + 1 }); if (profileFileRef.current) profileFileRef.current.value = ""; }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-bold"><X className="h-4 w-4" /> Annuler</button>}
              </div>
            </form>
          </Section>
          <Section title="Personnages">
            <div className="grid gap-3 sm:grid-cols-2">
              {profiles.map((profile) => (
                <article key={profile.id} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4">
                  {profile.image_url ? <img src={profile.image_url} alt="" className="h-14 w-14 rounded-full object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-black text-primary">{profile.name.slice(0, 1)}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h4 className="font-extrabold">{profile.name}</h4><span className="text-xs text-foreground/45">{profile.content_id}</span></div>
                    <p className="mt-1 line-clamp-2 text-xs text-foreground/60">{profile.summary}</p>
                    <p className="mt-1 text-xs font-semibold text-primary">{profile.reference}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => toggleActive("PersonalityQuizProfile", profile)} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">{profile.is_active ? "Désactiver" : "Activer"}</button>
                      <button type="button" onClick={() => editProfile(profile)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold"><Pencil className="h-3.5 w-3.5" /> Modifier</button>
                      <button type="button" onClick={() => setProfileDeleteTarget(profile)} className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
                    </div>
                  </div>
                </article>
              ))}
              {!profiles.length && <p className="text-sm text-foreground/55">Aucun profil enregistré.</p>}
            </div>
          </Section>
        </div>
      )}

      {tab === "stats" && (
        <Section title="Statistiques des résultats">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground/65">Les réponses, scores détaillés et données personnelles ne sont jamais affichés ici.</p>
            <select className={`${INPUT} w-auto`} value={statsPeriod} onChange={(event) => setStatsPeriod(event.target.value)} aria-label="Période des statistiques">
              <option value="all">Depuis le début</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option>
            </select>
          </div>
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-primary/5 p-4">
            <Users className="h-6 w-6 text-primary" />
            <div><p className="text-2xl font-black">{filteredResults.length}</p><p className="text-xs text-foreground/60">résultats terminés</p></div>
          </div>
          <div className="space-y-3">
            {profileCounts.map((profile) => {
              const max = Math.max(1, ...profileCounts.map((item) => item.count));
              return (
                <div key={profile.content_id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span>{profile.name}</span><strong>{profile.count}</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(profile.count / max) * 100}%` }} /></div>
                </div>
              );
            })}
            {!profileCounts.length && <p className="text-sm text-foreground/55">Les résultats apparaîtront ici après les premières parties.</p>}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-foreground/50"><BarChart3 className="h-4 w-4" /> Tendances agrégées par profil; aucune réponse individuelle n'est visible.</div>
        </Section>
      )}

      {tab === "import" && (
        <div className="space-y-5">
          <Section title="Exporter les contenus">
            <p className="mb-4 text-sm text-foreground/65">L'export contient les questions, les points et les profils, jamais les résultats des joueurs.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportJson} disabled={!questions.length || !profiles.length} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50"><Download className="h-4 w-4" /> Exporter JSON</button>
              <button type="button" onClick={exportCsv} disabled={!questions.length || !profiles.length} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-bold disabled:opacity-50"><Download className="h-4 w-4" /> Exporter CSV</button>
            </div>
          </Section>
          <Section title="Importer un paquet JSON ou CSV">
            <p className="mb-4 text-sm leading-relaxed text-foreground/65">Sélectionne un fichier pour vérifier son contenu avant toute écriture. L'ajout refuse les identifiants déjà utilisés; le remplacement synchronise ces deux listes et supprime les éléments absents du fichier.</p>
            <input ref={importFileRef} type="file" accept=".json,.csv,application/json,text/csv" className={`${INPUT} file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-bold`} onChange={readImport} />
            {importPreview && (
              <div className="mt-5 space-y-4 rounded-2xl border border-border bg-background p-4">
                <div>
                  <h4 className="font-extrabold">Aperçu : {importPreview.filename}</h4>
                  <p className="mt-1 text-sm text-foreground/65">{importPreview.questions.length} questions valides · {importPreview.profiles.length} profils valides</p>
                </div>
                {!!importErrors.length && <ul className="space-y-1 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{importErrors.map((error) => <li key={error}>• {error}</li>)}</ul>}
                {!importErrors.length && (
                  <>
                    <div className="max-h-48 overflow-auto rounded-xl border border-border p-3">
                      {importPreview.questions.slice(0, 5).map((question) => <p key={question.content_id} className="truncate py-1 text-xs"><strong>Q:</strong> {question.question}</p>)}
                      {importPreview.questions.length > 5 && <p className="pt-1 text-xs text-foreground/50">… et {importPreview.questions.length - 5} autres questions</p>}
                      {importPreview.profiles.map((profile) => <p key={profile.content_id} className="truncate py-1 text-xs"><strong>Profil:</strong> {profile.name}</p>)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={saving} onClick={() => setImportAction("append")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60"><FileUp className="h-4 w-4" /> Ajouter après confirmation</button>
                      <button type="button" disabled={saving} onClick={() => setImportAction("replace")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-destructive/40 px-5 font-bold text-destructive disabled:opacity-60">Remplacer après confirmation</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Section>
        </div>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
            <AlertDialogDescription>« {deleteTarget?.question} » sera retirée du test. Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={removeQuestion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(profileDeleteTarget)} onOpenChange={(open) => { if (!open) setProfileDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le profil {profileDeleteTarget?.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les points qui lui sont exclusivement attribués dans une réponse seront réassignés au premier profil actif. Les résultats déjà enregistrés restent privés et seront comptés sous « Profil supprimé ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={removeProfile} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer le profil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(importAction)} onOpenChange={(open) => { if (!open) setImportAction(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{importAction === "replace" ? "Remplacer les questions et profils ?" : "Ajouter ce contenu au test ?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {importAction === "replace"
                ? "Les questions et profils qui ne figurent pas dans le fichier seront supprimés. Les résultats personnels déjà enregistrés resteront privés et inchangés."
                : "Le fichier sera ajouté uniquement si tous ses identifiants sont nouveaux. Aucun contenu actuel ne sera modifié."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={importData} disabled={saving} className={importAction === "replace" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
