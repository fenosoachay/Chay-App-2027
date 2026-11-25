// Réactions aux messages (1.3.36), comme Messenger : 6 réactions, une seule par personne et par message.
// Règles pures (testées par node --test), utilisées par la route reactMessage. Mêmes valeurs que
// src/lib/reactionsMessages.js.

const REACTIONS = ['❤️', '😆', '😮', '😢', '😠', '👍'];

/** Réactions d'un message après le choix de `userId` : même emoji = retirée, vide = retirée, sinon remplacée. */
function appliquer(reactions, userId, emoji) {
  const r = reactions && typeof reactions === 'object' && !Array.isArray(reactions) ? Object.assign({}, reactions) : {};
  if (!emoji || r[userId] === emoji) delete r[userId];
  else r[userId] = emoji;
  // Ménage : seulement des réactions connues.
  for (const k of Object.keys(r)) if (REACTIONS.indexOf(r[k]) === -1) delete r[k];
  return r;
}

const valide = (emoji) => emoji === '' || emoji === null || REACTIONS.indexOf(emoji) !== -1;

module.exports = { REACTIONS, appliquer, valide };
