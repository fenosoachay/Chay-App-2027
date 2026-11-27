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
import { enregistrerScore } from "@/lib/scoreBoard";
import { useBackHandler } from "@/hooks/useBackHandler";
import { jouerSon } from "@/lib/sonsJeu";
import {
  getPuzzlesForDifficulty,
  PUZZLE_DIFFICULTIES,
  selectRandomPuzzle,
} from "@/lib/puzzleGame";

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
            <p className="mt-1 text-xs text-foreground/60">Quittez la partie et choisissez un autre niveau.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// 1.3.26 : le Puzzle est un jeu de Chay Enfants (Enfants › Jeux › Puzzle) : `profil` = l'enfant qui joue (ses
// points vont au Score Board des enfants). `integre` : affiché dans Chay Enfants (sans grand titre ni marges).
export default function Puzzle({ profil = null, integre = false }) {
  const [puzzles, setPuzzles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPuzzle, setSelectedPuzzle] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultImageFailed, setResultImageFailed] = useState(false);
  const game = usePuzzleGame(difficulty?.pieces || PUZZLE_DIFFICULTIES[0].pieces);

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
    jouerSon("victoire");
    // Score Board des enfants (1.3.26) : 5 points par pièce du puzzle réussi, au nom de l'enfant qui joue.
    if (profil) enregistrerScore("puzzle", { pieces: game.pieces.length, pseudo: profil.pseudo, avatar: profil.avatar, enfant_id: profil.id });
    confetti({
      particleCount: 85,
      spread: 72,
      origin: { y: 0.65 },
      colors: [gold, "#FFF1C2", "#2E9D68", "#FFFFFF"],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  }, [game.solved]);

  const startPuzzle = () => {
    setResultImageFailed(false);
    game.restart(difficulty.pieces);
    setPlaying(true);
  };

  const startLevel = (level) => {
    const puzzle = selectRandomPuzzle(puzzles, level.value);
    if (!puzzle) return;
    setSelectedPuzzle(puzzle);
    setDifficulty(level);
    setResultImageFailed(false);
    game.restart(level.pieces);
    setPlaying(true);
  };

  const quitPuzzle = () => {
    setPlaying(false);
    setSelectedPuzzle(null);
    setDifficulty(null);
  };
  // Retour du téléphone pendant une partie : retour au choix du niveau (pas à l'écran précédent).
  useBackHandler(integre && playing, quitPuzzle);

  const formatTitle = (puzzle) => puzzle.title || "Puzzle biblique";

  if (playing && selectedPuzzle) {
    return (
      <main className={integre ? "" : "mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10"}>
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
                Choisir un autre niveau
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    );
  }

  return (
    <main className={integre ? "" : "mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12"}>
      <header className={integre ? "hidden" : "mb-7"}>
        <h1 className="display-fluid">Puzzle <span className="brand-gradient-text">biblique</span></h1>
        <p className="mt-3 max-w-2xl text-foreground/60">
          Reconstituez une image biblique pièce par pièce. L’administrateur attribue un niveau à chaque image; vous choisissez seulement votre difficulté. Une image de ce niveau vous sera proposée au hasard.
        </p>
      </header>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>
      ) : loadError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{loadError}</p>
          <button type="button" onClick={loadPuzzles} className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-bold hover:bg-muted">Réessayer</button>
        </div>
      ) : !PUZZLE_DIFFICULTIES.some((level) => getPuzzlesForDifficulty(puzzles, level.value).length > 0) ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <ImageOff className="mx-auto h-9 w-9 text-foreground/35" />
          <p className="mt-3 font-bold">Aucun niveau n’est disponible pour le moment.</p>
          <p className="mt-1 text-sm text-foreground/55">L’administrateur doit ajouter des images et leur attribuer une difficulté.</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="puzzle-difficulty-heading">
            <h2 id="puzzle-difficulty-heading" className="mb-4 font-display text-xl font-extrabold">
              Choisissez votre niveau
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {PUZZLE_DIFFICULTIES.map((level) => {
                const count = getPuzzlesForDifficulty(puzzles, level.value).length;
                return (
                  <motion.button
                    key={level.value}
                    type="button"
                    disabled={!count}
                    onClick={() => startLevel(level)}
                    whileHover={count ? { y: -3 } : undefined}
                    whileTap={count ? { scale: 0.98 } : undefined}
                    className="min-h-36 rounded-[1.5rem] border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/50 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="block font-display text-2xl font-extrabold">{level.label}</span>
                    <span className="mt-2 block text-sm text-foreground/65">
                      {level.size} × {level.size} pièces
                    </span>
                    <span className="mt-4 block text-xs font-bold text-primary">
                      {count ? `${count} image${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""}` : "Aucune image disponible"}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
