import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_BLAST_CATEGORIES,
  BLOCK_BLAST_SHAPES,
  calculateBlockBlastPoints,
  canPlaceBlockBlastShape,
  clearCompletedBlockBlastLines,
  createBlockBlastMessagePicker,
  createEmptyBlockBlastBoard,
  exportBlockBlastCsv,
  getBlockBlastEvents,
  hasAnyBlockBlastMove,
  parseBlockBlastCsv,
  placeBlockBlastShape,
  validateBlockBlastMessages,
} from "./blockBlast.js";

test("places a piece without overlap and rejects out-of-range placements", () => {
  const board = createEmptyBlockBlastBoard();
  const single = BLOCK_BLAST_SHAPES.find((shape) => shape.id === "single");
  const first = placeBlockBlastShape(board, single, 0, 0, "blue");
  assert.equal(first[0][0], "blue");
  assert.equal(board[0][0], null);
  assert.equal(canPlaceBlockBlastShape(first, single, 0, 0), false);
  assert.equal(canPlaceBlockBlastShape(first, single, 9, 10), false);
  assert.equal(placeBlockBlastShape(first, single, 0, 0), null);
});

test("clears every complete row and column in one placement", () => {
  const board = createEmptyBlockBlastBoard();
  for (let column = 0; column < 10; column += 1) {
    if (column !== 4) board[2][column] = "blue";
  }
  for (let row = 0; row < 10; row += 1) {
    if (row !== 2) board[row][4] = "blue";
  }
  const single = BLOCK_BLAST_SHAPES.find((shape) => shape.id === "single");
  const placed = placeBlockBlastShape(board, single, 2, 4);
  const cleared = clearCompletedBlockBlastLines(placed);
  assert.deepEqual(cleared.rows, [2]);
  assert.deepEqual(cleared.columns, [4]);
  assert.ok(cleared.board.every((line) => line[4] === null));
  assert.ok(cleared.board[2].every((cell) => cell === null));
  assert.equal(calculateBlockBlastPoints(single, cleared.rows.length, cleared.columns.length), 21);
});

test("detects no legal move when a board is full", () => {
  const board = Array.from({ length: 10 }, () => Array(10).fill("blue"));
  assert.equal(hasAnyBlockBlastMove(board, [{ shapeId: "single" }]), false);
  assert.equal(hasAnyBlockBlastMove(createEmptyBlockBlastBoard(), [{ shapeId: "square" }]), true);
});

test("reports line, column, combo, milestone, and new-record events", () => {
  assert.deepEqual(getBlockBlastEvents({ clearedRows: 1 }), ["line_completed"]);
  assert.deepEqual(getBlockBlastEvents({ clearedColumns: 1 }), ["column_completed"]);
  assert.deepEqual(getBlockBlastEvents({ clearedRows: 1, clearedColumns: 1 }), ["multiple_lines"]);
  assert.deepEqual(getBlockBlastEvents({ oldScore: 90, newScore: 105, newRecord: true }), ["score_milestone", "new_record"]);
  assert.deepEqual(getBlockBlastEvents({ oldScore: 101, newScore: 199 }), []);
  assert.ok(BLOCK_BLAST_CATEGORIES.includes("game_over"));
});

test("message picker avoids immediate repeats and falls back to general messages", () => {
  const messages = [
    { id: "line-a", category: "line_completed", message: "Bravo A", active: true },
    { id: "line-b", category: "line_completed", message: "Bravo B", active: true },
    { id: "general-a", category: "general", message: "Continue A", active: true },
    { id: "general-b", category: "general", message: "Continue B", active: true },
    { id: "off", category: "game_over", message: "Désactivé", active: false },
  ];
  const picker = createBlockBlastMessagePicker(messages, () => 0);
  assert.equal(picker("line_completed").id, "line-a");
  assert.equal(picker("line_completed").id, "line-b");
  assert.equal(picker("score_milestone").id, "general-a");
  assert.equal(picker("score_milestone").id, "general-b");
  assert.equal(picker("game_over").id, "general-a");
  assert.equal(createBlockBlastMessagePicker([], () => 0)("line_completed"), null);
});

test("JSON validation generates missing IDs and reports unknown categories, empty text, and duplicates", () => {
  const parsed = validateBlockBlastMessages([
    { category: "general", message: "Message accentué, oui !", active: "true" },
  ], { idFactory: () => "generated-id" });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.messages, [{
    id: "generated-id",
    category: "general",
    message: "Message accentué, oui !",
    active: true,
  }]);

  const invalid = validateBlockBlastMessages([
    { id: "same", category: "unknown", message: "Bonjour", active: true },
    { id: "same", category: "general", message: "  ", active: false },
  ]);
  assert.equal(invalid.messages.length, 0);
  assert.equal(invalid.errors.length, 4);
});

test("CSV import/export preserves quotes, accents, commas, blank lines, and optional IDs", () => {
  const input = [
    "id,category,message,active",
    'msg_1,line_completed,"Bravo, ""continue"" ! Étape franchie.",true',
    "",
    ",general,Chaque progrès compte.,1",
  ].join("\r\n");
  const parsed = parseBlockBlastCsv(input);
  const validated = validateBlockBlastMessages(parsed, { idFactory: () => "auto-id" });
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.messages[0].message, 'Bravo, "continue" ! Étape franchie.');
  assert.equal(validated.messages[1].id, "auto-id");
  assert.deepEqual(
    validateBlockBlastMessages(parseBlockBlastCsv(exportBlockBlastCsv(validated.messages))).errors,
    []
  );
});

test("CSV parsing rejects malformed quoting and missing columns", () => {
  assert.throws(() => parseBlockBlastCsv('id,category,message,active\nmsg,general,"unfinished,true'));
  assert.throws(() => parseBlockBlastCsv("id,message\none,hello"));
});
