import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

export const QUESTION_SECONDS = 30;

// Partie de quiz 100 % serveur : questions sans bonne réponse, validation de
// chaque réponse par le serveur. Rien n'est mis en cache localement.
export default function useQuizGame(difficulty) {
  const [status, setStatus] = useState("loading"); // loading | playing | finished | error
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null); // { chosen, is_correct, correct_answer, explanation }
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(QUESTION_SECONDS);
  const [checking, setChecking] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const answeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke("quizStart", { difficulty })
      .then((res) => {
        if (cancelled) return;
        if (!res.data.questions.length) {
          setError("Aucune question disponible pour ce niveau.");
          setStatus("error");
          return;
        }
        setSession(res.data);
        setStatus("playing");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || "Impossible de démarrer la partie.");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [difficulty]);

  const answer = useCallback(async (letter) => {
    if (answeredRef.current || !session) return;
    answeredRef.current = true;
    setChecking(true);
    const question = session.questions[index];
    const res = await base44.functions.invoke("quizAnswer", {
      question_id: question.id,
      user_answer: letter || "",
      session_id: session.session_id,
      progress_id: session.progress_id,
      difficulty,
    });
    setResult({ chosen: letter || null, ...res.data });
    if (res.data.is_correct) setScore((s) => s + 1);
    setChecking(false);
  }, [session, index, difficulty]);

  // Minuteur : temps écoulé = réponse fausse.
  useEffect(() => {
    if (status !== "playing" || result) return undefined;
    if (seconds <= 0) {
      answer("");
      return undefined;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [status, result, seconds, answer]);

  const next = useCallback(async () => {
    if (index + 1 < session.questions.length) {
      answeredRef.current = false;
      setIndex((i) => i + 1);
      setResult(null);
      setSeconds(QUESTION_SECONDS);
      return;
    }
    setChecking(true);
    const res = await base44.functions.invoke("quizFinish", {
      session_id: session.session_id,
      difficulty,
    });
    setSummary(res.data);
    setChecking(false);
    setStatus("finished");
  }, [index, session, difficulty]);

  return {
    status, session, index, result, score, seconds, checking, summary, error,
    question: session?.questions[index],
    total: session?.questions.length || 0,
    answer, next,
  };
}