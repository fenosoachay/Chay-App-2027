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

// type : "annotation" | "message"
export function enqueue(type, payload) {
  const list = read();
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, at: Date.now() });
  write(list);
}

export function removeFromQueue(id) {
  write(read().filter((a) => a.id !== id));
}

export function queueSize() {
  return read().length;
}