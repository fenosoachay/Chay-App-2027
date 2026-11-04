import { useCallback, useEffect, useRef, useState } from "react";
import { createShuffledPieces, isPuzzleSolved, swapPuzzlePieces } from "@/lib/puzzleGame";

export default function usePuzzleGame(pieceCount) {
  const [pieces, setPieces] = useState([]);
  const [moves, setMoves] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [solved, setSolved] = useState(false);
  const startedAt = useRef(0);
  const piecesRef = useRef([]);

  const restart = useCallback(() => {
    const shuffled = createShuffledPieces(pieceCount);
    piecesRef.current = shuffled;
    setPieces(shuffled);
    setMoves(0);
    setElapsedSeconds(0);
    setSolved(false);
    setStarted(true);
    startedAt.current = Date.now();
  }, [pieceCount]);

  useEffect(() => {
    if (!started || solved) return undefined;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [solved, started]);

  const swap = useCallback((firstIndex, secondIndex) => {
    if (!started || solved || firstIndex === secondIndex) return;
    const next = swapPuzzlePieces(piecesRef.current, firstIndex, secondIndex);
    if (next === piecesRef.current) return;
    piecesRef.current = next;
    setPieces(next);
    setMoves((count) => count + 1);
    if (isPuzzleSolved(next)) {
      setSolved(true);
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }
  }, [solved, started]);

  return { pieces, moves, elapsedSeconds, started, solved, restart, swap };
}
