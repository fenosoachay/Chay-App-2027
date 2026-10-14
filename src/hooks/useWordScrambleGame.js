import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const NEXT_DELAY = 1500;

const toTiles = (chars, wordIndex) => chars.map((char, i) => ({ id: `${wordIndex}-${i}-${Math.random().toString(36).slice(2, 6)}`, char }));

// Partie « Mots mélangés » 100 % serveur : le mot n'est jamais connu du client
// avant la bonne réponse (seules les lettres mélangées sont reçues).
export default function useWordScrambleGame(difficulty) {
  const [status, setStatus] = useState("loading"); // loading | playing | finished | error
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [word, setWord] = useState(null); // { wordId, wordLength }
  const [pool, setPool] = useState([]); // tuiles disponibles
  const [placed, setPlaced] = useState([]); // tuiles placées, dans l'ordre
  const [lockedFirst, setLockedFirst] = useState(null); // tuile verrouillée en case 1
  const [phrase, setPhrase] = useState(null); // { hint, reference }
  const [score, setScore] = useState(0);
  const [credits, setCredits] = useState(0);
  const [feedback, setFeedback] = useState(null); // null | "wrong" | "correct"
  const [lastGain, setLastGain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const startedRef = useRef(false);
  const checkingRef = useRef(false);

  const loadWord = useCallback(async (sess, i) => {
    const res = await base44.functions.invoke("wsWord", {
      session_id: sess.session_id, difficulty, index: i,
    });
    const d = res.data;
    const tiles = toTiles(d.shuffledLetters, i);
    setWord({ wordId: d.wordId, wordLength: d.wordLength });
    setPhrase(d.hint_phrase ? { hint: d.hint_phrase, reference: d.hint_bible_reference } : null);
    setFeedback(null);
    setLastGain(0);
    checkingRef.current = false;
    setPlaced([]);
    setLockedFirst(null);
    setPool(tiles);
    return { d, tiles };
  }, [difficulty]);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("wsStart", { difficulty });
        setSession(res.data);
        setCredits(res.data.credits);
        await loadWord(res.data, 0);
        setStatus("playing");
      } catch (e) {
        setError(e?.response?.data?.error || "Impossible de démarrer la partie.");
        setStatus("error");
      }
    })();
  }, [difficulty, loadWord]);

  const finish = useCallback(async (sess) => {
    setBusy(true);
    const res = await base44.functions.invoke("wsFinish", { session_id: sess.session_id, difficulty });
    setSummary(res.data);
    setBusy(false);
    setStatus("finished");
  }, [difficulty]);

  const advance = useCallback(async () => {
    if (index + 1 < session.total) {
      setBusy(true);
      setIndex((n) => n + 1);
      await loadWord(session, index + 1);
      setBusy(false);
      return;
    }
    await finish(session);
  }, [index, session, loadWord, finish]);

  const submit = useCallback(async (tiles) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    const answer = tiles.map((t) => t.char).join("");
    try {
      const res = await base44.functions.invoke("wsAnswer", {
        session_id: session.session_id, difficulty, wordId: word.wordId, userAnswer: answer,
      });
      if (res.data.correct) {
        setFeedback("correct");
        setLastGain(res.data.score);
        setScore((s) => s + res.data.score);
        setTimeout(advance, NEXT_DELAY);
        return;
      }
      setFeedback("wrong");
      setTimeout(() => {
        setFeedback(null);
        checkingRef.current = false;
      }, 700);
    } catch {
      checkingRef.current = false;
    }
  }, [session, difficulty, word, advance]);

  const place = (tile) => {
    if (feedback === "correct" || checkingRef.current) return;
    const next = [...placed, tile];
    if (next.length > word.wordLength) return;
    setPool((p) => p.filter((t) => t.id !== tile.id));
    setPlaced(next);
    if (next.length === word.wordLength) submit(next);
  };

  const unplace = (tile) => {
    if (feedback === "correct" || checkingRef.current || tile.id === lockedFirst?.id) return;
    setPlaced((p) => p.filter((t) => t.id !== tile.id));
    setPool((p) => [...p, tile]);
  };

  const erase = () => {
    const last = [...placed].reverse().find((t) => t.id !== lockedFirst?.id);
    if (last) unplace(last);
  };

  // Mélange gratuit : uniquement local, sur les lettres restantes.
  const shufflePool = () => {
    setPool((p) => {
      const arr = [...p];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  };

  const buyHint = async (hintType) => {
    if (busy || checkingRef.current) return { error: "busy" };
    setBusy(true);
    try {
      const res = await base44.functions.invoke("wsHint", {
        session_id: session.session_id, difficulty, wordId: word.wordId, hintType,
      });
      setCredits(res.data.creditsRemaining);
      if (hintType === "first_letter") {
        const letter = res.data.hint;
        // Replace toute lettre déjà en case 1 dans le pool, puis place la bonne.
        const current = placed[0];
        let nextPool = [...pool];
        let nextPlaced = [...placed];
        if (current && current.char === letter) {
          setLockedFirst(current);
        } else {
          if (current) {
            nextPool.push(...nextPlaced);
            nextPlaced = [];
          }
          const tile = nextPool.find((t) => t.char === letter);
          if (tile) {
            nextPool = nextPool.filter((t) => t.id !== tile.id);
            nextPlaced = [tile, ...nextPlaced];
            setLockedFirst(tile);
          }
          setPool(nextPool);
          setPlaced(nextPlaced);
        }
      } else {
        setPhrase({ hint: res.data.hint, reference: res.data.reference });
      }
      setBusy(false);
      return { ok: true };
    } catch (e) {
      setBusy(false);
      return { error: e?.response?.data?.error || "Une erreur est survenue" };
    }
  };

  return {
    status, error, session, index, total: session?.total || 0, word, pool, placed,
    lockedFirst, phrase, score, credits, feedback, lastGain, busy, summary,
    place, unplace, erase, shufflePool, buyHint,
  };
}