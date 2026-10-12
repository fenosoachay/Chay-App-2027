// File d'attente locale des actions faites hors ligne (annotations, messages).
// Persistée dans localStorage, rejouée au retour du réseau.
const KEY = "chay_offline_queue_v1";

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}

export function getQueue() {
  return read();
}

// type : "annotation" | "message" | "progress"
export function enqueue(type, payload) {
  let list = read();
  // La progression de lecture ne garde que la dernière valeur par version.
  if (type === "progress") list = list.filter((a) => !(a.type === "progress" && a.payload.versionId === payload.versionId));
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, at: Date.now() });
  write(list);
}

export function removeFromQueue(id) {
  write(read().filter((a) => a.id !== id));
}

export function queueSize() {
  return read().length;
}