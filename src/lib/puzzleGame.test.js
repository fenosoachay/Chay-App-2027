import test from "node:test";
import assert from "node:assert/strict";
import {
  createShuffledPieces,
  getPuzzlesForDifficulty,
  isPuzzleSolved,
  PUZZLE_DIFFICULTIES,
  selectRandomPuzzle,
  swapPuzzlePieces,
} from "./puzzleGame.js";

const puzzles = [
  { id: "easy-1", difficulty: "easy", image_url: "one.jpg", is_active: true, is_deleted: false },
  { id: "easy-2", difficulty: "easy", image_url: "two.jpg", is_active: true, is_deleted: false },
  { id: "medium", difficulty: "medium", image_url: "three.jpg", is_active: true, is_deleted: false },
  { id: "inactive", difficulty: "easy", image_url: "four.jpg", is_active: false, is_deleted: false },
  { id: "archived", difficulty: "easy", image_url: "five.jpg", is_active: true, is_deleted: true },
  { id: "unrated", image_url: "six.jpg", is_active: true, is_deleted: false },
];

test("puzzle difficulty sizes match the requested piece grids", () => {
  assert.deepEqual(
    PUZZLE_DIFFICULTIES.map(({ size, pieces }) => [size, pieces]),
    [[3, 9], [4, 16], [5, 25]]
  );
});

test("only active, non-archived puzzles assigned to the chosen level are eligible", () => {
  assert.deepEqual(
    getPuzzlesForDifficulty(puzzles, "easy").map(({ id }) => id),
    ["easy-1", "easy-2"]
  );
  assert.equal(getPuzzlesForDifficulty(puzzles, "hard").length, 0);
});

test("chooses a random puzzle from the selected level and returns null when empty", () => {
  assert.equal(selectRandomPuzzle(puzzles, "easy", () => 0).id, "easy-1");
  assert.equal(selectRandomPuzzle(puzzles, "easy", () => 0.99).id, "easy-2");
  assert.equal(selectRandomPuzzle(puzzles, "hard"), null);
});

test("shuffled puzzle contains every piece and is never initially solved", () => {
  for (const { pieces: count } of PUZZLE_DIFFICULTIES) {
    const pieces = createShuffledPieces(count, () => 0.5);
    assert.equal(pieces.length, count);
    assert.deepEqual([...pieces].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    assert.equal(isPuzzleSolved(pieces), false);
  }
});

test("swapping two puzzle slots preserves all pieces and detects completion", () => {
  const shuffled = [1, 0, 2, 3];
  const solved = swapPuzzlePieces(shuffled, 0, 1);
  assert.deepEqual(solved, [0, 1, 2, 3]);
  assert.equal(isPuzzleSolved(solved), true);
  assert.deepEqual(shuffled, [1, 0, 2, 3]);
});

test("invalid or same-slot swaps leave the puzzle unchanged", () => {
  const pieces = [0, 1, 2];
  assert.equal(swapPuzzlePieces(pieces, 1, 1), pieces);
  assert.equal(swapPuzzlePieces(pieces, -1, 0), pieces);
  assert.equal(isPuzzleSolved([]), false);
});
