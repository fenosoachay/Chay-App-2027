import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Blocks, Check, CircleHelp, Pause, Play, RotateCcw, Trophy, X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { enregistrerScore } from "@/lib/scoreBoard";
import {
  BLOCK_BLAST_CATEGORIES,
  BLOCK_BLAST_MILESTONE,
  BLOCK_BLAST_SHAPES,
  calculateBlockBlastPoints,
  canPlaceBlockBlastShape,
  clearCompletedBlockBlastLines,
  createBlockBlastMessagePicker,
  createEmptyBlockBlastBoard,
  generateBlockBlastPieces,
  getBlockBlastEvents,
  hasAnyBlockBlastMove,
  placeBlockBlastShape,
} from "@/lib/blockBlast";

const PIECE_COLORS = ["#44916F", "#e7a83e", "#8d6ac7", "#e77362", "#4d83c5"];
const CELL_GAP = 3;

async function loadActiveMessages() {
  const all = [];
  let cursor;
  do {
    const page = await base44.entities.BlockBlastMessage.filter(
      { active: true },
      { sort: "message_id", limit: 200, cursor }
    );
    all.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all.map((message) => ({
    id: message.message_id,
    category: message.category,
    message: message.message,
    active: message.active,
  })).filter((message) => BLOCK_BLAST_CATEGORIES.includes(message.category) && message.message?.trim());
}

function shapeForPiece(piece) {
  return BLOCK_BLAST_SHAPES.find((shape) => shape.id === piece?.shapeId);
}

function shapeDimensions(shape) {
  return {
    rows: Math.max(...shape.cells.map(([row]) => row)) + 1,
    columns: Math.max(...shape.cells.map(([, column]) => column)) + 1,
  };
}

function PiecePreview({ piece, selected, disabled, onSelect, onDragStart }) {
  const shape = shapeForPiece(piece);
  if (!piece || !shape) {
    return <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-foreground/35">Placée</div>;
  }
  const { rows, columns } = shapeDimensions(shape);
  return (
    <button
      type="button"
      draggable={!disabled}
      onClick={onSelect}
      onDragStart={(event) => onDragStart(event, piece.id)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Pièce ${piece.shapeId}${selected ? ", sélectionnée" : ""}`}
      className={`flex min-h-24 w-full items-center justify-center rounded-2xl border-2 transition ${
        selected ? "border-primary bg-primary/10 shadow-md" : "border-border bg-background hover:border-primary/50"
      } ${disabled ? "cursor-not-allowed opacity-35" : "cursor-grab active:cursor-grabbing"}`}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, 16px)`, gridTemplateRows: `repeat(${rows}, 16px)` }}
      >
        {Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const occupied = shape.cells.some(([r, c]) => r === row && c === column);
          return (
            <span
              key={index}
              className="rounded-[4px]"
              style={{ backgroundColor: occupied ? PIECE_COLORS[piece.colorIndex || 0] : "transparent" }}
            />
          );
        })}
      </div>
    </button>
  );
}

export default function BlockBlast() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [board, setBoard] = useState(createEmptyBlockBlastBoard);
  const [pieces, setPieces] = useState(() => generateBlockBlastPieces().map((piece, index) => ({ ...piece, colorIndex: index })));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [rowsCleared, setRowsCleared] = useState(0);
  const [columnsCleared, setColumnsCleared] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [messageState, setMessageState] = useState("loading");
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [notice, setNotice] = useState(null);
  const [noticeQueue, setNoticeQueue] = useState([]);
  const pickerRef = useRef(createBlockBlastMessagePicker([]));
  const dragPieceRef = useRef(null);
  const gameSavedRef = useRef(true);
  const userId = user?.id || "guest";
  const storageKey = `block-blast-best:${userId}`;

  useEffect(() => {
    try {
      setBestScore(Math.max(0, Number(localStorage.getItem(storageKey)) || 0));
    } catch (error) {
      toast({ title: "Record local indisponible", description: error?.message || "Le meilleur score sera chargé depuis ton compte.", variant: "destructive" });
    }

    let active = true;
    loadActiveMessages().then((items) => {
      if (!active) return;
      pickerRef.current = createBlockBlastMessagePicker(items);
      setMessageState(items.length ? "ready" : "empty");
    }).catch((error) => {
      if (!active) return;
      pickerRef.current = createBlockBlastMessagePicker([]);
      setMessageState("error");
      toast({
        title: "Messages personnalisés indisponibles",
        description: error?.message || "La partie reste jouable; les popups seront affichés lorsque la bibliothèque sera disponible.",
        variant: "destructive",
      });
    });

    if (user?.id) {
      base44.entities.BlockBlastScore.filter(
        { user_id: user.id },
        { sort: "-score", limit: 1 }
      ).then((records) => {
        if (!active || !records?.length) return;
        const remoteBest = Number(records[0].best_score || records[0].score) || 0;
        setBestScore((current) => Math.max(current, remoteBest));
        try {
          localStorage.setItem(storageKey, String(Math.max(remoteBest, Number(localStorage.getItem(storageKey)) || 0)));
        } catch {
          // The remote score remains available when local storage is disabled.
        }
      }).catch((error) => {
        if (active) toast({
          title: "Record du compte indisponible",
          description: error?.message || "Le record local reste affiché.",
          variant: "destructive",
        });
      });
    }
    return () => { active = false; };
  }, [storageKey, user?.id, toast]);

  useEffect(() => {
    if (!notice && noticeQueue.length) {
      setNotice(noticeQueue[0]);
      setNoticeQueue((queue) => queue.slice(1));
    }
  }, [notice, noticeQueue]);

  const remainingPieces = useMemo(() => pieces.filter(Boolean), [pieces]);
  const progressToNextMilestone = score % BLOCK_BLAST_MILESTONE;

  const enqueueEvents = useCallback((categories) => {
    const next = categories.map((category) => pickerRef.current(category)).filter(Boolean);
    if (next.length) setNoticeQueue((queue) => [...queue, ...next]);
  }, []);

  const finishGame = useCallback(async (finalScore, finalRows, finalColumns, finalBest) => {
    if (gameSavedRef.current) return;
    gameSavedRef.current = true;
    // Leaderboard (1.3.22) : score de la partie (le serveur compte score ÷ 10).
    if (finalScore > 0) enregistrerScore("brique", { score: finalScore });
    const playedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey, String(finalBest));
    } catch (error) {
      toast({
        title: "Sauvegarde locale impossible",
        description: error?.message || "Le record sera conservé sur ton compte si la sauvegarde en ligne réussit.",
        variant: "destructive",
      });
    }
    if (!user?.id) return;
    try {
      await base44.entities.BlockBlastScore.create({
        user_id: user.id,
        score: finalScore,
        best_score: finalBest,
        rows_cleared: finalRows,
        columns_cleared: finalColumns,
        played_at: playedAt,
      });
    } catch (error) {
      toast({
        title: "Partie non enregistrée en ligne",
        description: error?.message || "Le score reste disponible dans cette partie.",
        variant: "destructive",
      });
    }
  }, [storageKey, toast, user?.id]);

  const startNewGame = () => {
    setBoard(createEmptyBlockBlastBoard());
    setPieces(generateBlockBlastPieces().map((piece, index) => ({ ...piece, colorIndex: index })));
    setScore(0);
    setRowsCleared(0);
    setColumnsCleared(0);
    setSelectedPieceId(null);
    setPaused(false);
    setGameOver(false);
    setHasStarted(true);
    setNotice(null);
    setNoticeQueue([]);
    gameSavedRef.current = false;
  };

  const placePiece = useCallback((pieceId, row, column) => {
    if (paused || gameOver || notice || !pieceId) return false;
    const slot = pieces.findIndex((piece) => piece?.id === pieceId);
    if (slot < 0) return false;
    const piece = pieces[slot];
    const shape = shapeForPiece(piece);
    if (!shape || !canPlaceBlockBlastShape(board, shape, row, column)) return false;

    const placed = placeBlockBlastShape(board, shape, row, column, PIECE_COLORS[piece.colorIndex || 0]);
    const cleared = clearCompletedBlockBlastLines(placed);
    const earned = calculateBlockBlastPoints(shape, cleared.rows.length, cleared.columns.length);
    const nextScore = score + earned;
    const nextRows = rowsCleared + cleared.rows.length;
    const nextColumns = columnsCleared + cleared.columns.length;
    const newRecord = nextScore > bestScore;
    const nextBest = Math.max(bestScore, nextScore);
    let nextPieces = pieces.map((item, index) => index === slot ? null : item);
    if (nextPieces.every((item) => !item)) {
      nextPieces = generateBlockBlastPieces().map((nextPiece, index) => ({
        ...nextPiece,
        colorIndex: (slot + index + 1) % PIECE_COLORS.length,
      }));
    }
    const noMoves = !hasAnyBlockBlastMove(cleared.board, nextPieces);
    const events = getBlockBlastEvents({
      clearedRows: cleared.rows.length,
      clearedColumns: cleared.columns.length,
      oldScore: score,
      newScore: nextScore,
      newRecord,
    });
    if (noMoves) {
      setGameOver(true);
      if (nextScore > 0) events.push("game_over");
      finishGame(nextScore, nextRows, nextColumns, nextBest);
    }
    setBoard(cleared.board);
    setPieces(nextPieces);
    setScore(nextScore);
    setRowsCleared(nextRows);
    setColumnsCleared(nextColumns);
    setBestScore(nextBest);
    setSelectedPieceId(null);
    enqueueEvents(events);
    return true;
  }, [bestScore, board, enqueueEvents, finishGame, gameOver, notice, paused, pieces, rowsCleared, score, columnsCleared]);

  const handleDrop = (event, row, column) => {
    event.preventDefault();
    const pieceId = event.dataTransfer?.getData("text/plain") || dragPieceRef.current;
    if (placePiece(pieceId, row, column)) dragPieceRef.current = null;
  };

  const handleDragStart = (event, pieceId) => {
    dragPieceRef.current = pieceId;
    setSelectedPieceId(pieceId);
    event.dataTransfer?.setData("text/plain", pieceId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  const handleCellClick = (row, column) => {
    if (selectedPieceId) placePiece(selectedPieceId, row, column);
  };

  const messageStatus = messageState === "empty"
    ? "Aucun message actif pour le moment. La partie reste jouable."
    : messageState === "error"
      ? "La bibliothèque de messages n'a pas pu être chargée."
      : messageState === "loading"
        ? "Chargement des messages personnalisés…"
        : "";

  const isPlaying = hasStarted && !gameOver;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
      <Link to="/games" className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-foreground/65 transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tous les jeux
      </Link>

      <header className="mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Blocks className="h-8 w-8" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">Brique</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-foreground/65 sm:text-base">
          Place les trois formes sur la grille de 10 × 10. Complète des lignes ou des colonnes pour les libérer et marquer davantage de points.
        </p>
      </header>

      {!hasStarted && (
        <section className="mx-auto mb-6 max-w-3xl rounded-2xl border border-border bg-card p-5 text-center shadow-sm sm:p-7">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-primary">
            <CircleHelp className="h-4 w-4" /> Comment jouer
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/70">
            Fais glisser une pièce sur la grille, ou sélectionne-la puis touche une case. Les pièces ne peuvent pas se chevaucher. Chaque bloc posé rapporte un point; chaque ligne ou colonne effacée en rapporte dix. La partie se termine quand aucune pièce restante ne peut être placée.
          </p>
          <button type="button" onClick={startNewGame} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 font-extrabold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <Play className="h-5 w-5" /> Jouer
          </button>
        </section>
      )}

      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <section className="relative rounded-[1.75rem] border border-border bg-card p-3 shadow-lg sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 px-1 sm:mb-4 sm:px-2">
            <div className="flex gap-2 sm:gap-3">
              <div className="min-w-[5.5rem] rounded-xl border border-border bg-background px-3 py-2 text-center">
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-foreground/50">Score</p>
                <p className="text-xl font-black tabular-nums">{score}</p>
              </div>
              <div className="min-w-[5.5rem] rounded-xl border border-border bg-background px-3 py-2 text-center">
                <p className="flex items-center justify-center gap-1 text-[0.625rem] font-bold uppercase tracking-wider text-foreground/50"><Trophy className="h-3 w-3" /> Record</p>
                <p className="text-xl font-black tabular-nums">{bestScore}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isPlaying && <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Reprendre" : "Mettre en pause"} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background transition hover:bg-muted">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>}
              <button type="button" onClick={startNewGame} aria-label="Recommencer" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background transition hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>
            </div>
          </div>

          <div
            className="relative mx-auto grid aspect-square w-full max-w-[34rem] touch-manipulation select-none overflow-hidden rounded-xl border-2 border-border bg-muted/45 p-1.5 sm:p-2"
            style={{ gridTemplateColumns: `repeat(10, minmax(0, 1fr))`, gap: CELL_GAP }}
            aria-label="Grille de Brique de 10 par 10"
          >
            {board.flatMap((line, row) => line.map((cell, column) => (
              <button
                key={`${row}-${column}`}
                type="button"
                aria-label={`Ligne ${row + 1}, colonne ${column + 1}${cell ? ", occupée" : ""}`}
                onClick={() => handleCellClick(row, column)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, row, column)}
                disabled={!isPlaying || paused}
                className={`min-h-0 min-w-0 rounded-[4px] transition-colors sm:rounded-md ${
                  cell
                    ? "shadow-sm"
                    : selectedPieceId && isPlaying && !paused
                      ? "bg-background/80 hover:bg-primary/15"
                      : "bg-background/75"
                }`}
                style={cell ? { backgroundColor: cell } : undefined}
              />
            )))}
            <AnimatePresence>
              {paused && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/90 backdrop-blur-sm">
                  <Pause className="h-10 w-10 text-primary" />
                  <h2 className="mt-3 text-2xl font-black">Pause</h2>
                  <button type="button" onClick={() => setPaused(false)} className="mt-4 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Reprendre</button>
                </motion.div>
              )}
              {gameOver && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/95 p-5 text-center backdrop-blur-sm">
                  <Trophy className="h-11 w-11 text-primary" />
                  <h2 className="mt-3 text-2xl font-black">Fin de partie</h2>
                  <p className="mt-2 text-4xl font-black text-primary">{score}</p>
                  <p className="mt-1 text-sm text-foreground/65">Lignes : {rowsCleared} · Colonnes : {columnsCleared}</p>
                  <button type="button" onClick={startNewGame} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"><RotateCcw className="h-4 w-4" /> Rejouer</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {messageStatus && <p className="mt-3 text-center text-xs text-foreground/45" role="status">{messageStatus}</p>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-black">Tes pièces</h2>
              <span className="text-xs font-semibold text-foreground/50">{remainingPieces.length} restantes</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {pieces.map((piece, index) => (
                <PiecePreview
                  key={piece?.id || `empty-${index}`}
                  piece={piece}
                  selected={selectedPieceId === piece?.id}
                  disabled={!isPlaying || paused}
                  onSelect={() => setSelectedPieceId(piece?.id || null)}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-foreground/50">Sélectionne une pièce puis touche la case de départ, ou glisse-la sur la grille.</p>
          </section>

          <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-black">Ta progression</h2>
              <span className="text-xs font-bold text-primary">{BLOCK_BLAST_MILESTONE - progressToNextMilestone} pts avant le prochain palier</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(progressToNextMilestone / BLOCK_BLAST_MILESTONE) * 100}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-background p-3 text-center"><p className="text-2xl font-black">{rowsCleared}</p><p className="text-xs text-foreground/55">lignes effacées</p></div>
              <div className="rounded-xl bg-background p-3 text-center"><p className="text-2xl font-black">{columnsCleared}</p><p className="text-xs text-foreground/55">colonnes effacées</p></div>
            </div>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setNotice(null); }}
          >
            <motion.section
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="block-blast-message-title"
              className="relative w-full max-w-md rounded-[2rem] border border-primary/20 bg-card p-7 text-center shadow-2xl sm:p-9"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Check className="h-8 w-8" /></div>
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{notice.category.replaceAll("_", " ")}</p>
              <h2 id="block-blast-message-title" className="mt-3 text-xl font-extrabold leading-relaxed sm:text-2xl">{notice.message}</h2>
              <button autoFocus type="button" onClick={() => setNotice(null)} className="mt-7 inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-full bg-primary px-7 font-extrabold text-primary-foreground shadow-sm transition hover:opacity-90">
                Continuer <Check className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Fermer le message" onClick={() => setNotice(null)} className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground/55 hover:text-foreground"><X className="h-4 w-4" /></button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
