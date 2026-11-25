import { useCallback, useEffect, useRef, useState } from "react";

const QUESTION_SECONDS = 30;
const INITIAL_LIVES = 3;

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export default function useGameLogic(questions, timerEnabled = true) {
  const answeredRef = useRef(false);
  const [gameQuestions, setGameQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [correctCount, setCorrectCount] = useState(0);
  const [foundAnswers, setFoundAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hintText, setHintText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [status, setStatus] = useState("ready");
  const [gameOver, setGameOver] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const question = gameQuestions[questionIndex] || null;

  const start = useCallback(() => {
    answeredRef.current = false;
    // 1.3.31 : l'ordre des réponses est mélangé à chaque partie (la bonne réponse n'est plus presque toujours A).
    setGameQuestions(shuffle(questions).map((q) => ({ ...q, options: shuffle(Array.isArray(q.options) ? q.options : []) })));
    setQuestionIndex(0);
    setScore(0);
    setLives(INITIAL_LIVES);
    setCorrectCount(0);
    setFoundAnswers([]);
    setSelectedAnswer(null);
    setHintsRevealed(0);
    setHintText("");
    setSecondsLeft(QUESTION_SECONDS);
    setGameOver(false);
    setTimedOut(false);
    setStatus("playing");
  }, [questions]);

  const answer = useCallback((choice) => {
    if (answeredRef.current || status !== "playing" || selectedAnswer !== null || !question) return;

    answeredRef.current = true;
    setSelectedAnswer(choice ?? "__timeout__");
    setTimedOut(choice === null);
    if (choice === question.answer) {
      setScore((current) => current + 10);
      setCorrectCount((current) => current + 1);
      setFoundAnswers((current) => [...current, question.answer]);
      return;
    }

    const remainingLives = lives - 1;
    setLives(remainingLives);
    if (remainingLives <= 0) {
      setGameOver(true);
    }
  }, [lives, question, selectedAnswer, status]);

  useEffect(() => {
    if (status !== "playing" || selectedAnswer !== null || !timerEnabled) return undefined;
    if (secondsLeft <= 0) {
      answer(null);
      return undefined;
    }

    const timeout = setTimeout(() => {
      setSecondsLeft((remaining) => remaining - 1);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [answer, secondsLeft, selectedAnswer, status, timerEnabled]);

  const revealHint = useCallback(() => {
    if (status !== "playing" || selectedAnswer !== null || !question || hintsRevealed >= 2) return;

    setScore((current) => Math.max(0, current - 1));
    const nextHint = hintsRevealed === 0
      ? `Première lettre : ${question.answer.charAt(0).toLocaleUpperCase("fr-FR")}`
      : question.hint;
    setHintText(nextHint);
    setHintsRevealed((current) => current + 1);
  }, [hintsRevealed, question, selectedAnswer, status]);

  const next = useCallback(() => {
    if (status !== "playing" || selectedAnswer === null) return;
    if (gameOver) {
      setStatus("finished");
      return;
    }
    if (questionIndex + 1 >= gameQuestions.length) {
      setStatus("finished");
      return;
    }

    setQuestionIndex((current) => current + 1);
    answeredRef.current = false;
    setSelectedAnswer(null);
    setTimedOut(false);
    setHintsRevealed(0);
    setHintText("");
    setSecondsLeft(QUESTION_SECONDS);
  }, [gameOver, gameQuestions.length, questionIndex, selectedAnswer, status]);

  return {
    question,
    questionIndex,
    totalQuestions: gameQuestions.length,
    score,
    lives,
    correctCount,
    foundAnswers,
    selectedAnswer,
    timedOut,
    hintsRevealed,
    hintText,
    secondsLeft: timerEnabled ? secondsLeft : null,
    status,
    gameOver,
    start,
    answer,
    revealHint,
    next,
  };
}
