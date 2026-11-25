import React, { useEffect, useMemo, useState } from "react";
import { jouerSon } from "@/lib/sonsJeu";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Check, Heart, Loader2, RotateCcw, Share2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { parseReference } from "@/lib/bibleBookRefs";
import {
  evaluatePersonalityQuiz,
  PERSONALITY_QUIZ_QUESTION_COUNT,
  PERSONALITY_QUIZ_SUBTITLE,
  PERSONALITY_QUIZ_TITLE,
} from "@/lib/personalityQuiz";

async function loadActiveContent(entity) {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities[entity].filter(
      { is_active: true },
      { sort: "sort_order", limit: 100, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

export default function PersonalityQuiz() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [questions, setQuestions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [bibleVerse, setBibleVerse] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadActiveContent("PersonalityQuizQuestion"),
      loadActiveContent("PersonalityQuizProfile"),
    ]).then(([allQuestions, allProfiles]) => {
      if (!active) return;
      setQuestions(allQuestions);
      setProfiles(allProfiles);
    }).catch((error) => {
      if (!active) return;
      toast({
        title: "Jeu indisponible",
        description: error?.message || "Impossible de charger le questionnaire. Réessaie plus tard.",
        variant: "destructive",
      });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [toast]);

  const playableQuestions = useMemo(
    () => questions
      .filter((question) => Array.isArray(question.answers) && question.answers.length === 4)
      .slice(0, PERSONALITY_QUIZ_QUESTION_COUNT),
    [questions]
  );
  const question = playableQuestions[questionIndex];

  useEffect(() => {
    let active = true;
    setBibleVerse(null);
    if (!result?.primary?.reference) return undefined;
    (async () => {
      try {
        const books = await getLocalBooks("fr");
        const parsed = parseReference(result.primary.reference, books);
        if (!parsed) return;
        const verses = await getLocalChapterVerses("fr", parsed.bookId, parsed.chapter);
        const verse = parsed.verse
          ? verses.find((item) => item.number === parsed.verse)
          : null;
        if (active && verse) setBibleVerse(verse.text);
      } catch {
        // Keep the verified reference and Bible reader link when the local text is unavailable.
      }
    })();
    return () => { active = false; };
  }, [result]);

  const persistResult = async (outcome, selectedAnswers) => {
    if (!user?.id) return;
    setSavingResult(true);
    try {
      await base44.entities.PersonalityQuizResult.create({
        user_id: user.id,
        profile_id: outcome.primary.content_id,
        answers: selectedAnswers,
        scores: outcome.scores,
        completed_at: new Date().toISOString(),
      });
      setSaveError(false);
    } catch (error) {
      setSaveError(true);
      toast({
        title: "Résultat non enregistré",
        description: error?.message || "Tu peux consulter ton résultat, mais sa sauvegarde a échoué.",
        variant: "destructive",
      });
    } finally {
      setSavingResult(false);
    }
  };

  const chooseAnswer = (answerId) => {
    if (!question || advancing || result) return;
    jouerSon("clic");
    const nextAnswers = { ...answers, [question.content_id]: answerId };
    setAnswers(nextAnswers);
    setAdvancing(true);
    window.setTimeout(() => {
      if (questionIndex + 1 < playableQuestions.length) {
        setQuestionIndex((index) => index + 1);
        setAdvancing(false);
        return;
      }
      const outcome = evaluatePersonalityQuiz(playableQuestions, profiles, nextAnswers);
      if (!outcome) {
        setAdvancing(false);
        toast({
          title: "Questionnaire incomplet",
          description: "Une réponse n'a pas pu être prise en compte. Recommence le test.",
          variant: "destructive",
        });
        return;
      }
      setResult(outcome);
      jouerSon("victoire");
      setAdvancing(false);
      persistResult(outcome, nextAnswers);
    }, 350);
  };

  const restart = () => {
    setStarted(false);
    setQuestionIndex(0);
    setAnswers({});
    setResult(null);
    setSaveError(false);
    setImageFailed(false);
  };

  const shareResult = async () => {
    if (!result || shareBusy) return;
    setShareBusy(true);
    const text = `Mon résultat au test biblique : ${result.primary.name} — ${result.primary.reference}. Découvre le jeu : ${window.location.origin}/personality-quiz`;
    try {
      if (navigator.share) {
        await navigator.share({ title: PERSONALITY_QUIZ_TITLE, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast({ title: "Résultat copié", description: "Tu peux maintenant le partager." });
      } else {
        throw new Error("Le partage n'est pas disponible dans ce navigateur.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        toast({ title: "Partage impossible", description: error?.message || "Réessaie plus tard.", variant: "destructive" });
      }
    } finally {
      setShareBusy(false);
    }
  };

  const canPlay = playableQuestions.length >= PERSONALITY_QUIZ_QUESTION_COUNT
    && profiles.some((profile) => profile.is_active);
  const verseNumber = result?.primary?.reference.match(/:(\d+)$/)?.[1];

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Chargement du jeu" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12">
      <Link to="/games" className="mb-7 inline-flex items-center gap-2 text-sm font-bold text-foreground/65 transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tous les jeux
      </Link>

      <AnimatePresence mode="wait">
        {result ? (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="overflow-hidden rounded-[2rem] border border-primary/20 bg-card shadow-xl"
          >
            <div className="bg-gradient-to-br from-primary/20 via-background to-secondary/20 px-6 py-10 text-center sm:px-10">
              <Sparkles className="mx-auto mb-4 h-9 w-9 text-primary" aria-hidden="true" />
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-primary">Ton profil biblique</p>
              <div className="mx-auto mt-5 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary/10 shadow-lg">
                {result.primary.image_url && !imageFailed ? (
                  <img
                    src={result.primary.image_url}
                    alt={`Illustration de ${result.primary.name}`}
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span className="font-display text-4xl font-black text-primary" aria-hidden="true">
                    {result.primary.name.slice(0, 1)}
                  </span>
                )}
              </div>
              <h1 className="mt-5 font-display text-4xl font-black sm:text-5xl">{result.primary.name}</h1>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-foreground/75">{result.primary.summary}</p>
              {result.secondary && (
                <p className="mt-4 text-sm text-foreground/65">
                  Tu as aussi quelques ressemblances avec <strong>{result.secondary.name}</strong>.
                </p>
              )}
            </div>

            <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-2">
              <div>
                <h2 className="mb-3 text-lg font-extrabold">Ce qui ressort de tes réponses</h2>
                <div className="space-y-3">
                  {result.reasons.map((reason) => (
                    <div key={`${reason.question}-${reason.answer}`} className="rounded-2xl border border-border bg-background/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">{reason.question}</p>
                      <p className="mt-1 text-sm leading-relaxed">{reason.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h2 className="mb-3 text-lg font-extrabold">Des qualités à célébrer</h2>
                  <ul className="space-y-2">
                    {result.primary.qualities.map((quality) => (
                      <li key={quality} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {quality}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="mb-3 text-lg font-extrabold">Pour continuer à grandir</h2>
                  <ul className="space-y-2">
                    {result.primary.growth_areas.map((area) => (
                      <li key={area} className="flex items-start gap-2 text-sm text-foreground/75">
                        <Heart className="mt-0.5 h-4 w-4 shrink-0 text-secondary" /> {area}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 md:col-span-2">
                <div className="flex items-center gap-2 font-extrabold">
                  <BookOpen className="h-5 w-5 text-primary" /> Un passage à découvrir
                </div>
                {bibleVerse && <blockquote className="mt-3 text-base italic leading-relaxed">« {bibleVerse} »</blockquote>}
                <p className="mt-2 text-sm font-bold text-primary">{result.primary.reference} — Louis Segond 1910</p>
                <Link
                  to={`/bible?view=reader&translation=fra_lsg&ref=${encodeURIComponent(result.primary.reference)}${verseNumber ? `&verse=${verseNumber}` : ""}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"
                >
                  Lire dans la Bible <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border p-6 sm:flex-row sm:justify-center sm:p-8">
              <button onClick={restart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground transition hover:opacity-90">
                <RotateCcw className="h-4 w-4" /> Refaire le test
              </button>
              <button onClick={shareResult} disabled={shareBusy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 font-bold transition hover:bg-muted disabled:opacity-60">
                {shareBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Partager
              </button>
            </div>
            {(savingResult || saveError) && (
              <p className="px-6 pb-5 text-center text-xs text-foreground/55" role="status">
                {savingResult ? "Enregistrement privé du résultat…" : "Ce résultat n'a pas été sauvegardé dans ton compte."}
              </p>
            )}
          </motion.section>
        ) : started && question ? (
          <motion.section
            key={`question-${question.content_id}`}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            className="rounded-[2rem] border border-border bg-card p-5 shadow-lg sm:p-9"
          >
            <div className="mb-7 flex items-center justify-between gap-4">
              <span className="text-sm font-extrabold text-primary">
                Question {questionIndex + 1} sur {playableQuestions.length}
              </span>
              <button type="button" onClick={restart} className="text-sm font-bold text-foreground/60 hover:text-foreground">Quitter</button>
            </div>
            <div className="mb-7 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={questionIndex + 1} aria-valuemin={1} aria-valuemax={playableQuestions.length}>
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((questionIndex + 1) / playableQuestions.length) * 100}%` }} />
            </div>
            <h1 className="font-display text-2xl font-black leading-snug sm:text-3xl">{question.question}</h1>
            <p className="mt-2 text-sm text-foreground/60">Choisis la réponse qui te ressemble le plus.</p>
            <div className="mt-6 grid gap-3">
              {question.answers.map((answer) => (
                <button
                  key={answer.id}
                  type="button"
                  disabled={advancing}
                  onClick={() => chooseAnswer(answer.id)}
                  className={`flex min-h-[4.25rem] items-center justify-between gap-4 rounded-2xl border-2 px-4 py-4 text-left font-semibold transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70 sm:px-5 ${
                    answers[question.content_id] === answer.id ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <span>{answer.text}</span>
                  {advancing && answers[question.content_id] === answer.id
                    ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                    : <ArrowRight className="h-4 w-4 shrink-0 text-foreground/35" />}
                </button>
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-foreground/50">Tes réponses restent privées et ne sont pas publiées.</p>
          </motion.section>
        ) : (
          <motion.section
            key="intro"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-[2rem] border border-border bg-card p-7 text-center shadow-lg sm:p-12"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.16em] text-primary">Mieux se connaître</p>
            <h1 className="mx-auto mt-3 max-w-3xl font-display text-3xl font-black leading-tight sm:text-4xl">{PERSONALITY_QUIZ_TITLE}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-foreground/70">{PERSONALITY_QUIZ_SUBTITLE}</p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-foreground/60">
              Il ne s'agit pas d'un diagnostic ni d'une étiquette : ce jeu est une invitation à réfléchir à tes qualités et à découvrir des récits bibliques.
            </p>
            {canPlay ? (
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 font-extrabold text-primary-foreground shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Sparkles className="h-5 w-5" /> Commencer le test
              </button>
            ) : (
              <div className="mx-auto mt-7 max-w-xl rounded-2xl border border-border bg-background p-4 text-sm text-foreground/65" role="status">
                Le questionnaire n'est pas encore prêt. Il faut au moins dix questions actives et un profil actif.
              </div>
            )}
            <p className="mt-5 text-xs text-foreground/45">Environ 3 minutes · {playableQuestions.length} questions disponibles</p>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
