import test from "node:test";
import assert from "node:assert/strict";
import {
  createShuffledPieces,
  isPuzzleSolved,
  PUZZLE_DIFFICULTIES,
  swapPuzzlePieces,
} from "./puzzleGame.js";

test("puzzle difficulty sizes match the requested piece grids", () => {
  assert.deepEqual(
    PUZZLE_DIFFICULTIES.map(({ size, pieces }) => [size, pieces]),
    [[3, 9], [4, 16], [5, 25]]
  );
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
