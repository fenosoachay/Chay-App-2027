// « Vu » dans la liste des discussions (1.3.43), comme Messenger : quand MON dernier message a été lu, la petite
// photo de ceux qui l'ont vu s'affiche au bout de la ligne, sans ouvrir la discussion.
/**
 * @param {object|null} dernier   dernier message affichable de la discussion
 * @param {string} moi            mon identifiant
 * @param {string[]} participants participants de la discussion
 * @returns {string[]} identifiants de ceux qui ont vu mon dernier message (moi exclu), dans l'ordre de lecture
 */
export function vuParDernier(dernier, moi, participants = []) {
  if (!dernier || !moi || dernier.sender_id !== moi) return [];
  const membres = new Set(participants);
  const vus = [];
  for (const id of dernier.read_by || []) {
    if (id && id !== moi && (!membres.size || membres.has(id)) && !vus.includes(id)) vus.push(id);
  }
  return vus;
}
