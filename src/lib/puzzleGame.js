export const PUZZLE_DIFFICULTIES = [
  { value: "easy", label: "Facile", size: 3, pieces: 9 },
  { value: "medium", label: "Moyen", size: 4, pieces: 16 },
  { value: "hard", label: "Difficile", size: 5, pieces: 25 },
];

export function getPuzzlesForDifficulty(puzzles, difficulty) {
  return puzzles.filter((puzzle) => (
    puzzle.is_active &&
    !puzzle.is_deleted &&
    puzzle.image_url &&
    puzzle.difficulty === difficulty
  ));
}

export function selectRandomPuzzle(puzzles, difficulty, random = Math.random) {
  const eligible = getPuzzlesForDifficulty(puzzles, difficulty);
  if (!eligible.length) return null;
  const randomIndex = Math.min(eligible.length - 1, Math.floor(random() * eligible.length));
  return eligible[randomIndex];
}

export function createShuffledPieces(count, random = Math.random) {
  const pieces = Array.from({ length: count }, (_, index) => index);
  for (let index = pieces.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pieces[index], pieces[swapIndex]] = [pieces[swapIndex], pieces[index]];
  }

  if (pieces.every((piece, index) => piece === index) && pieces.length > 1) {
    [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
  }
  return pieces;
}

export function swapPuzzlePieces(pieces, firstIndex, secondIndex) {
  if (
    firstIndex === secondIndex ||
    firstIndex < 0 ||
    secondIndex < 0 ||
    firstIndex >= pieces.length ||
    secondIndex >= pieces.length
  ) return pieces;

  const next = [...pieces];
  [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
  return next;
}

export function isPuzzleSolved(pieces) {
  return pieces.length > 0 && pieces.every((piece, index) => piece === index);
}
