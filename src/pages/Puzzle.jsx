import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock3,
  Eye,
  ImageOff,
  Loader2,
  Move,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import usePuzzleGame from "@/hooks/usePuzzleGame";
import { PUZZLE_DIFFICULTIES } from "@/lib/puzzleGame";

const gold = "#F6C453";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function PuzzleBoard({ imageUrl, size, game }) {
  const [dimensions, setDimensions] = useState(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [draggingSlot, setDraggingSlot] = useState(null);
  const dragRef = useRef(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    setDimensions(null);
    setImageLoadError(false);
    setSelectedSlot(null);
  }, [imageUrl, size]);

  const handlePointerDown = (event, slot) => {
    if (game.solved || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      slot,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 7) {
      drag.moved = true;
      setDraggingSlot(drag.slot);
    }
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingSlot(null);
    if (!drag.moved) return;

    didDragRef.current = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-puzzle-slot]");
    const targetSlot = Number(target?.getAttribute("data-puzzle-slot"));
    if (target && Number.isInteger(targetSlot)) game.swap(drag.slot, targetSlot);
    setSelectedSlot(null);
    setTimeout(() => { didDragRef.current = false; }, 0);
  };

  const selectOrSwap = (slot) => {
    if (didDragRef.current || game.solved) return;
    if (selectedSlot === null) {
      setSelectedSlot(slot);
    } else if (selectedSlot === slot) {
      setSelectedSlot(null);
    } else {
      game.swap(selectedSlot, slot);
      setSelectedSlot(null);
    }
  };

  const onKeyDown = (event, slot) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOrSwap(slot);
    }
  };

  const ratio = dimensions ? dimensions.width / dimensions.height : 1;
  const boardWidth = ratio >= 1
    ? `min(100%, 760px, calc(68dvh * ${ratio}))`
    : `min(100%, calc(68dvh * ${ratio}))`;

  return (
    <div className="mx-auto w-full">
      <img
        src={imageUrl}
        alt=""
        className="sr-only"
        onError={() => setImageLoadError(true)}
        onLoad={(event) => setDimensions({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })}
      />
      {dimensions && (
        <div
          className="mx-auto grid touch-none overflow-hidden rounded-xl border-2 border-white/30 bg-black shadow-2xl shadow-black/50"
          style={{
            width: boardWidth,
            aspectRatio: `${dimensions.width} / ${dimensions.height}`,
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          }}
          aria-label={`Puzzle de ${size} par ${size} pièces`}
        >
          {game.pieces.map((piece, slot) => {
            const targetRow = Math.floor(piece / size);
            const targetColumn = piece % size;
            const backgroundPosition = size === 1
              ? "0% 0%"
              : `${(targetColumn / (size - 1)) * 100}% ${(targetRow / (size - 1)) * 100}%`;
            const isCorrect = piece === slot;
            return (
              <button
                key={piece}
                type="button"
                data-puzzle-slot={slot}
                aria-label={`Pièce ${piece + 1}, position ${slot + 1}${isCorrect ? ", bien placée" : ""}`}
                aria-pressed={selectedSlot === slot}
                onPointerDown={(event) => handlePointerDown(event, slot)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDraggingSlot(null);
                }}
                onClick={() => selectOrSwap(slot)}
                onKeyDown={(event) => onKeyDown(event, slot)}
                className={`relative min-h-0 min-w-0 border border-white/35 bg-cover transition-[filter,transform,box-shadow] duration-150 ${
                  isCorrect ? "z-0 brightness-110" : "z-0 brightness-90"
                } ${
                  draggingSlot === slot
                    ? "z-10 scale-[0.96] brightness-125 ring-4 ring-amber-300"
                    : selectedSlot === slot
                      ? "z-10 scale-[0.96] ring-4 ring-amber-300"
                      : "hover:z-10 hover:brightness-110"
                }`}
                style={{
                  backgroundImage: `url("${imageUrl.replaceAll('"', "%22")}")`,
                  backgroundSize: `${size * 100}% ${size * 100}%`,
                  backgroundPosition,
                }}
              >
                {isCorrect && (
                  <span className="absolute right-1 top-1 rounded-full bg-emerald-500/90 p-0.5 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!dimensions && !imageLoadError && (
        <div className="mx-auto grid aspect-square w-full max-w-[500px] place-items-center rounded-2xl border border-border bg-card">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      )}
      {imageLoadError && (
        <div className="mx-auto grid min-h-48 w-full max-w-[500px] place-items-center rounded-2xl border border-destructive/25 bg-destructive/5 p-6 text-center">
          <div>
            <ImageOff className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-bold">Cette image ne peut pas être chargée.</p>
            <p className="mt-1 text-xs text-foreground/60">Quittez la partie et choisissez un autre puzzle.</p>
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-foreground/55">
        Faites glisser une pièce sur une autre, ou touchez deux pièces pour les échanger.
      </p>
    </div>
  );
}

export default function Puzzle() {
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPuzzle, setSelectedPuzzle] = useState(null);
  const [difficulty, setDifficulty] = useState(PUZZLE_DIFFICULTIES[0]);
  const [playing, setPlaying] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [failedImages, setFailedImages] = useState({});
  const [resultImageFailed, setResultImageFailed] = useState(false);
  const game = usePuzzleGame(difficulty.pieces);

  const loadPuzzles = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const all = [];
      let cursor;
      do {
        const page = await base44.entities.PuzzleImage.filter(
          { is_active: true, is_deleted: false },
          { sort: "-created_date", limit: 100, cursor }
        );
        all.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      setPuzzles(all.filter((puzzle) => puzzle.is_active && !puzzle.is_deleted && puzzle.image_url));
    } catch (error) {
      setLoadError(error?.message || "Impossible de charger les puzzles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPuzzles();
  }, [loadPuzzles]);

  useEffect(() => {
    if (!game.solved) return;
    confetti({
      particleCount: 85,
      spread: 72,
      origin: { y: 0.65 },
      colors: [gold, "#FFF1C2", "#2E9D68", "#FFFFFF"],
    });
  }, [game.solved]);

  const startPuzzle = () => {
    setResultImageFailed(false);
    game.restart();
    setPlaying(true);
  };

  const quitPuzzle = () => {
    setPlaying(false);
    setSelectedPuzzle(null);
  };

  const formatTitle = (puzzle) => puzzle.title || "Puzzle biblique";

  if (playing && selectedPuzzle) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={quitPuzzle} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground/75 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Quitter
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold">
              <Clock3 className="h-4 w-4 text-primary" /> {formatTime(game.elapsedSeconds)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold">
              <Move className="h-4 w-4 text-primary" /> {game.moves} déplacements
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{formatTitle(selectedPuzzle)}</h1>
            <p className="mt-1 text-sm text-foreground/60">{difficulty.label} · {difficulty.size} × {difficulty.size} pièces</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted">
              <Eye className="h-4 w-4" /> Aperçu
            </button>
            <button type="button" onClick={startPuzzle} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-105">
              <RefreshCw className="h-4 w-4" /> Recommencer
            </button>
          </div>
        </div>

        <PuzzleBoard key={`${selectedPuzzle.id}-${difficulty.value}`} imageUrl={selectedPuzzle.image_url} size={difficulty.size} game={game} />

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Aperçu du puzzle</DialogTitle>
              <DialogDescription>{formatTitle(selectedPuzzle)} · {difficulty.label}</DialogDescription>
            </DialogHeader>
            <img src={selectedPuzzle.image_url} alt={formatTitle(selectedPuzzle)} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-xl object-contain" />
          </DialogContent>
        </Dialog>

        <Dialog open={game.solved} onOpenChange={(open) => {
          if (!open && game.solved) setPlaying(false);
        }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader className="text-center">
              <motion.div
                initial={{ scale: 0.6, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600"
              >
                <Trophy className="h-9 w-9" />
              </motion.div>
              <DialogTitle className="text-center text-2xl">Bravo, puzzle terminé !</DialogTitle>
              <DialogDescription className="text-center">
                {formatTime(game.elapsedSeconds)} · {game.moves} déplacements
              </DialogDescription>
            </DialogHeader>
            {resultImageFailed ? (
              <div className="grid aspect-video place-items-center rounded-xl bg-muted text-muted-foreground"><ImageOff className="h-8 w-8" /></div>
            ) : (
              <img
                src={selectedPuzzle.image_url}
                alt={formatTitle(selectedPuzzle)}
                onError={() => setResultImageFailed(true)}
                className="mx-auto max-h-[42dvh] w-auto max-w-full rounded-xl object-contain"
              />
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={startPuzzle} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-bold text-primary-foreground">
                <RefreshCw className="h-4 w-4" /> Rejouer
              </button>
              <button type="button" onClick={quitPuzzle} className="min-h-11 rounded-full border border-border px-5 py-2.5 font-bold hover:bg-muted">
                Choisir un autre puzzle
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-7">
        <h1 className="display-fluid">Puzzle <span className="brand-gradient-text">biblique</span></h1>
        <p className="mt-3 max-w-2xl text-foreground/60">
          Choisissez une image et un niveau, puis reconstituez-la en échangeant les pièces.
        </p>
      </header>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>
      ) : loadError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" onClick={loadPuzzles} className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted">Réessayer</button>
        </div>
      ) : puzzles.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <ImageOff className="mx-auto h-9 w-9 text-foreground/35" />
          <p className="mt-3 font-bold">Aucun puzzle disponible pour le moment.</p>
          <p className="mt-1 text-sm text-foreground/55">De nouvelles images seront bientôt ajoutées.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {puzzles.map((puzzle) => (
              <button
                key={puzzle.id}
                type="button"
                onClick={() => setSelectedPuzzle(puzzle)}
                aria-pressed={selectedPuzzle?.id === puzzle.id}
                className={`overflow-hidden rounded-[1.5rem] border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                  selectedPuzzle?.id === puzzle.id ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {failedImages[puzzle.id] ? (
                    <div className="grid h-full place-items-center text-foreground/35"><ImageOff className="h-9 w-9" /></div>
                  ) : (
                    <img
                      src={puzzle.image_url}
                      alt={formatTitle(puzzle)}
                      onError={() => setFailedImages((current) => ({ ...current, [puzzle.id]: true }))}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {selectedPuzzle?.id === puzzle.id && (
                    <span className="absolute right-3 top-3 rounded-full bg-primary p-1.5 text-primary-foreground"><Check className="h-4 w-4" /></span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-display text-lg font-extrabold">{formatTitle(puzzle)}</h2>
                  {puzzle.description && <p className="mt-1 line-clamp-2 text-sm text-foreground/60">{puzzle.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PUZZLE_DIFFICULTIES.map((level) => (
                      <span key={level.value} className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-foreground/65">
                        {level.label} · {level.size}×{level.size}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selectedPuzzle && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-[1.5rem] border border-primary/25 bg-primary/5 p-5"
            >
              <h2 className="font-display text-xl font-extrabold">Choisissez votre difficulté</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {PUZZLE_DIFFICULTIES.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    aria-pressed={difficulty.value === level.value}
                    onClick={() => setDifficulty(level)}
                    className={`min-h-12 rounded-xl border px-4 py-2 text-sm font-bold transition ${
                      difficulty.value === level.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    {level.label} · {level.size} × {level.size} ({level.pieces} pièces)
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={startPuzzle}
                disabled={Boolean(failedImages[selectedPuzzle.id])}
                className="mt-4 min-h-12 rounded-full bg-primary px-7 py-3 font-bold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Commencer le puzzle
              </button>
            </motion.section>
          )}
        </>
      )}
    </main>
  );
}
