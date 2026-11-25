// Réactions aux messages (1.3.36), comme Messenger. Mêmes valeurs que pocketbase/pb_hooks/lib/reactionsMessages.js.
// (src/lib/reactions.js : réactions aux contenus, autre chose.)

export const REACTIONS = ["❤️", "😆", "😮", "😢", "😠", "👍"];
export const NOMS_REACTIONS = { "❤️": "J'adore", "😆": "Haha", "😮": "Wouah", "😢": "Triste", "😠": "Grrr", "👍": "J'aime" };

const propre = (r) => (r && typeof r === "object" && !Array.isArray(r) ? r : {});

/** Pastille sous la bulle : les emojis (les plus donnés d'abord, 3 au plus) et le total. */
export function resume(reactions) {
  const r = propre(reactions);
  const compte = {};
  for (const e of Object.values(r)) if (REACTIONS.includes(e)) compte[e] = (compte[e] || 0) + 1;
  const emojis = Object.keys(compte).sort((a, b) => compte[b] - compte[a] || REACTIONS.indexOf(a) - REACTIONS.indexOf(b));
  return { emojis: emojis.slice(0, 3), total: emojis.reduce((n, e) => n + compte[e], 0) };
}

/** Choix de `uid` appliqué tout de suite à l'écran (avant la réponse du serveur) : même règle que le serveur. */
export function appliquer(reactions, uid, emoji) {
  const r = { ...propre(reactions) };
  if (!emoji || r[uid] === emoji) delete r[uid];
  else r[uid] = emoji;
  return r;
}

/** Qui a réagi, dans l'ordre des réactions : [{ uid, emoji }]. */
export const lecteursReactions = (reactions) =>
  Object.entries(propre(reactions)).filter(([, e]) => REACTIONS.includes(e)).map(([uid, emoji]) => ({ uid, emoji }))
    .sort((a, b) => REACTIONS.indexOf(a.emoji) - REACTIONS.indexOf(b.emoji));
