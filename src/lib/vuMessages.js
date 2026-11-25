// « Vu » des messages (1.3.35), pur et testé.

/**
 * Où mettre la photo « vu » de chaque autre participant : sous le dernier message qu'il a lu (le sien compte
 * comme lu). Rien si ce dernier message est le sien. Renvoie { [messageId]: [uid…] }.
 */
export function positionsVu(visibles, autres) {
  const out = {};
  for (const uid of autres || []) {
    let k = -1;
    for (let i = visibles.length - 1; i >= 0; i--) {
      const m = visibles[i];
      if (m.sender_id === uid || (m.read_by || []).includes(uid)) { k = i; break; }
    }
    if (k < 0 || visibles[k].sender_id === uid) continue;
    (out[visibles[k].id] ||= []).push(uid);
  }
  return out;
}
