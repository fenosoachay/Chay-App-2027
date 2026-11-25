// Pièces jointes des messages (1.3.35) : règles pures (testées par node --test), utilisées par createMessage
// et les notifications. Même aperçu que l'appli (src/lib/piecesJointes.js).

const DUREE_MAX = 600; // message vocal : 10 minutes

/** Genre d'une pièce jointe d'après son type MIME (et « vocal » demandé pour un audio enregistré). */
function genrePiece(mime, vocal) {
  const m = String(mime || '').toLowerCase();
  if (m.indexOf('audio/') === 0) return vocal ? 'vocal' : 'audio';
  if (m.indexOf('video/') === 0) return 'video';
  if (m.indexOf('image/') === 0) return 'image';
  if (m === 'application/octet-stream' || !m) return 'fichier';
  return 'document';
}

/** Pièce jointe enregistrée sur le message : { url, nom, mime, taille, genre, duree? }. */
function pieceJointe(p) {
  const genre = genrePiece(p.mime, p.vocal);
  const out = {
    url: String(p.url || ''),
    nom: String(p.nom || 'fichier').slice(0, 200),
    mime: String(p.mime || 'application/octet-stream').slice(0, 120),
    taille: Math.max(0, Number(p.taille) || 0),
    genre,
  };
  const d = Number(p.duree);
  if ((genre === 'vocal' || genre === 'audio' || genre === 'video') && Number.isFinite(d) && d > 0) out.duree = Math.min(DUREE_MAX, Math.round(d * 10) / 10);
  return out;
}

/** Aperçu court (liste des conversations, notifications). */
function apercuPiece(pj) {
  if (!pj || typeof pj !== 'object') return '';
  switch (pj.genre) {
    case 'vocal': return '🎤 Message vocal';
    case 'image': return '📷 Photo';
    case 'video': return '🎬 Vidéo';
    case 'audio': return '🎵 Audio';
    case 'document': return `📄 ${pj.nom || 'Document'}`;
    default: return `📎 ${pj.nom || 'Fichier'}`;
  }
}

module.exports = { DUREE_MAX, genrePiece, pieceJointe, apercuPiece };
