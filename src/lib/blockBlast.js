export const BLOCK_BLAST_SIZE = 10;
export const BLOCK_BLAST_CATEGORIES = [
  "line_completed",
  "column_completed",
  "multiple_lines",
  "score_milestone",
  "new_record",
  "game_over",
  "general",
];
export const BLOCK_BLAST_MILESTONE = 100;

export const BLOCK_BLAST_SHAPES = [
  { id: "single", cells: [[0, 0]] },
  { id: "domino", cells: [[0, 0], [0, 1]] },
  { id: "trio-line", cells: [[0, 0], [0, 1], [0, 2]] },
  { id: "trio-column", cells: [[0, 0], [1, 0], [2, 0]] },
  { id: "square", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: "line-four", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: "column-four", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: "t", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: "l", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: "zigzag", cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: "corner", cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { id: "plus", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
  { id: "square-nine", cells: Array.from({ length: 9 }, (_, index) => [Math.floor(index / 3), index % 3]) },
];

export function createEmptyBlockBlastBoard() {
  return Array.from({ length: BLOCK_BLAST_SIZE }, () => Array(BLOCK_BLAST_SIZE).fill(null));
}

export function canPlaceBlockBlastShape(board, shape, row, column) {
  if (!Array.isArray(board) || !Array.isArray(shape?.cells)) return false;
  return shape.cells.every(([rowOffset, columnOffset]) => {
    const targetRow = row + rowOffset;
    const targetColumn = column + columnOffset;
    return targetRow >= 0
      && targetRow < board.length
      && targetColumn >= 0
      && targetColumn < board[targetRow].length
      && !board[targetRow][targetColumn];
  });
}

export function hasAnyBlockBlastMove(board, pieces) {
  return pieces.some((piece) => piece && BLOCK_BLAST_SHAPES.some((shape) => (
    shape.id === piece.shapeId
    && board.some((line, row) => line.some((_, column) => canPlaceBlockBlastShape(board, shape, row, column)))
  )));
}

export function placeBlockBlastShape(board, shape, row, column, color = "primary") {
  if (!canPlaceBlockBlastShape(board, shape, row, column)) return null;
  const nextBoard = board.map((line) => [...line]);
  shape.cells.forEach(([rowOffset, columnOffset]) => {
    nextBoard[row + rowOffset][column + columnOffset] = color;
  });
  return nextBoard;
}

export function clearCompletedBlockBlastLines(board) {
  const rows = board
    .map((line, index) => line.every(Boolean) ? index : -1)
    .filter((index) => index >= 0);
  const columns = Array.from({ length: board[0]?.length || 0 }, (_, column) => column)
    .filter((column) => board.every((line) => Boolean(line[column])));
  const clearRows = new Set(rows);
  const clearColumns = new Set(columns);
  const nextBoard = board.map((line, row) => line.map((cell, column) => (
    clearRows.has(row) || clearColumns.has(column) ? null : cell
  )));
  return { board: nextBoard, rows, columns };
}

export function calculateBlockBlastPoints(shape, clearedRows, clearedColumns) {
  return shape.cells.length + (clearedRows + clearedColumns) * 10;
}

export function generateBlockBlastPieces(random = Math.random) {
  return Array.from({ length: 3 }, (_, index) => {
    const shape = BLOCK_BLAST_SHAPES[Math.min(
      BLOCK_BLAST_SHAPES.length - 1,
      Math.floor(Math.max(0, random()) * BLOCK_BLAST_SHAPES.length)
    )];
    return { id: `${Date.now().toString(36)}-${index}-${Math.floor(random() * 1e9).toString(36)}`, shapeId: shape.id };
  });
}

export function getBlockBlastEvents({ clearedRows = 0, clearedColumns = 0, oldScore = 0, newScore = 0, newRecord = false }) {
  const events = [];
  const lines = clearedRows + clearedColumns;
  if (lines > 1) events.push("multiple_lines");
  else if (clearedRows) events.push("line_completed");
  else if (clearedColumns) events.push("column_completed");
  if (Math.floor(newScore / BLOCK_BLAST_MILESTONE) > Math.floor(oldScore / BLOCK_BLAST_MILESTONE)) {
    events.push("score_milestone");
  }
  if (newRecord) events.push("new_record");
  return events;
}

export function createBlockBlastMessagePicker(messages, random = Math.random) {
  const lastMessageByCategory = new Map();
  return (category) => {
    const usable = messages.filter((message) => message.active && message.message.trim());
    const categoryMessages = usable.filter((message) => message.category === category);
    const pool = categoryMessages.length
      ? categoryMessages
      : usable.filter((message) => message.category === "general");
    if (!pool.length) return null;
    const lastId = lastMessageByCategory.get(categoryMessages.length ? category : "general");
    const withoutLast = pool.length > 1 ? pool.filter((message) => message.id !== lastId) : pool;
    const safePool = withoutLast.length ? withoutLast : pool;
    const randomValue = Math.min(0.999999999, Math.max(0, random()));
    const selected = safePool[Math.floor(randomValue * safePool.length)];
    lastMessageByCategory.set(categoryMessages.length ? category : "general", selected.id);
    return selected;
  };
}

function isActiveValue(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return null;
}

export function validateBlockBlastMessages(raw, {
  existingIds = [],
  idFactory = (index) => `msg_${Date.now().toString(36)}_${index + 1}`,
} = {}) {
  const errors = [];
  const source = Array.isArray(raw) ? raw : raw?.messages;
  if (!Array.isArray(source)) {
    return { errors: ["Le fichier doit contenir une liste de messages."], messages: [] };
  }
  const seen = new Set();
  const knownExisting = new Set(existingIds);
  const messages = source.map((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`Ligne ${row} : message invalide.`);
      return null;
    }
    let id = String(item.id || "").trim();
    if (!id) id = idFactory(index);
    const category = String(item.category || "").trim();
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const active = isActiveValue(item.active);
    if (seen.has(id)) errors.push(`Ligne ${row} : identifiant « ${id} » en double.`);
    if (knownExisting.has(id)) errors.push(`Ligne ${row} : l'identifiant « ${id} » existe déjà.`);
    if (!BLOCK_BLAST_CATEGORIES.includes(category)) errors.push(`Ligne ${row} : catégorie inconnue « ${category} ».`);
    if (!message) errors.push(`Ligne ${row} : le message ne peut pas être vide.`);
    if (active === null) errors.push(`Ligne ${row} : « active » doit être true ou false.`);
    seen.add(id);
    return id && BLOCK_BLAST_CATEGORIES.includes(category) && message && active !== null
      ? { id, category, message: message.slice(0, 1000), active }
      : null;
  }).filter(Boolean);
  if (!messages.length) errors.push("Le fichier ne contient aucun message valide.");
  return { errors, messages };
}

export function parseBlockBlastCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(source || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Le CSV contient un champ entre guillemets qui n'est pas terminé.");
  if (field || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  if (rows.length < 2) throw new Error("Le CSV ne contient aucune ligne de messages.");
  const headers = rows[0].map((cell) => cell.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || !["id", "category", "message", "active"].every((key) => headers.includes(key))) {
    throw new Error("Le CSV doit contenir les colonnes id,category,message,active.");
  }
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Ligne ${index + 2} : nombre de colonnes incorrect.`);
    return Object.fromEntries(headers.map((header, cell) => [header, cells[cell]]));
  });
}

export function exportBlockBlastCsv(messages) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    ["id", "category", "message", "active"],
    ...messages.map(({ id, category, message, active }) => [id, category, message, active]),
  ].map((line) => line.map(escape).join(",")).join("\r\n");
}
