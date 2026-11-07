// Outils des routes de conversation (createConversation, updateConversationParticipants).

const MAX_PARTICIPANTS = 50;

/**
 * Liste de participants valide : tableau de chaînes (≤ 64 car.), sans doublon,
 * 2 personnes exactement pour une conversation directe, 2 à 50 pour un groupe.
 */
function validateParticipants(fn, value, type) {
  if (!Array.isArray(value)) throw new fn.HttpError(400, 'participant_ids requis');
  const ids = [];
  for (const v of value) {
    if (typeof v !== 'string' || !v || v.length > 64) throw new fn.HttpError(400, 'participant_ids invalide');
    if (ids.indexOf(v) === -1) ids.push(v);
  }
  if (type === 'direct' && ids.length !== 2) throw new fn.HttpError(400, 'Une conversation directe a exactement 2 participants');
  if (ids.length < 2 || ids.length > MAX_PARTICIPANTS) throw new fn.HttpError(400, 'Nombre de participants invalide');
  return ids;
}

/** true si au moins un id ne correspond à aucun utilisateur. */
function missingUsers(app, ids) {
  for (const id of ids) {
    try { app.findRecordById('users', id); } catch (_) { return true; }
  }
  return false;
}

/** Conversation directe existante entre exactement a et b (la plus ancienne), ou null. */
function findDirect(app, a, b) {
  const rows = app.findRecordsByFilter('Conversation',
    "type = 'direct' && participant_ids ~ {:a} && participant_ids ~ {:b}", 'base44_created_date,created', 20, 0,
    { a: `"${a}"`, b: `"${b}"` });
  for (const r of rows) {
    const p = JSON.parse(JSON.stringify(r)).participant_ids || [];
    if (p.length === 2 && p.indexOf(a) !== -1 && p.indexOf(b) !== -1) return r;
  }
  return null;
}

module.exports = { validateParticipants, missingUsers, findDirect };
