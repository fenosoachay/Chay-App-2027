// Lecteur vidéo natif Android (ExoPlayer via la session média) : à quelle vidéo appartient un événement
// « playbackState » ? Sans dépendance (testable avec node --test).
//
// Ce qui revient de la session média (MediaController) n'est pas toujours complet : la source (adresse) peut
// arriver VIDE et le type de média peut arriver à « audio » (valeur par défaut du plugin, quand les extras des
// métadonnées ne sont pas retransmis). Seul l'identifiant de file (queueId = mediaId) est toujours retransmis.
// On reconnaît donc d'abord la vidéo par son queueId, SANS exiger le type ; le repli sur la source (même
// adresse) exige, lui, mediaType === "video", comme avant.

// L'identifiant d'un contrôle média est un Symbol (src/lib/mediaControl.js) : un Symbol ne se convertit PAS en
// texte (`${symbole}` lève une TypeError). Chaque Symbol reçoit donc un numéro stable, unique pour la session.
const symbolNumbers = new Map();
let lastNumber = 0;

/** Identifiant de file (texte) envoyé au lecteur natif pour une vidéo ; stable pour un même contrôle. */
export function videoQueueId(controlId) {
  if (typeof controlId === "symbol") {
    if (!symbolNumbers.has(controlId)) symbolNumbers.set(controlId, ++lastNumber);
    return `video:${symbolNumbers.get(controlId)}`;
  }
  return `video:${String(controlId)}`;
}

/**
 * Vrai si l'événement natif concerne la vidéo actuellement affichée.
 * Un événement audio n'est jamais accepté : son queueId (identifiant de piste) ne commence pas par « video: »
 * et ne peut donc pas être celui de la vidéo active.
 */
export function isActiveVideoEvent(event, activeControl) {
  if (!event || activeControl?.type !== "video") return false;
  if (event.queueId && event.queueId === videoQueueId(activeControl.id)) return true;
  return event.mediaType === "video" && Boolean(event.source) && event.source === activeControl.source;
}
