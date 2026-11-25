// Pièces jointes des messages (1.3.35) : message vocal (10 min au plus), photo, vidéo, audio, document ou
// n'importe quel fichier jusqu'à 500 Mo. Même aperçu que le serveur (pocketbase/pb_hooks/lib/messagesPieces.js).

export const DUREE_VOCAL_MAX = 600; // 10 minutes
export const MAX_PIECE_OCTETS = 500 * 1024 * 1024;

const DOCS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv", "epub"];
const ext = (nom) => (/\.([a-z0-9]{1,5})$/i.exec(String(nom || "")) || [])[1]?.toLowerCase() || "";

/** Genre d'un fichier choisi (avant l'envoi) : image, video, audio, document ou fichier. */
export function genreFichier(file) {
  const t = String(file?.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t === "application/pdf" || DOCS.includes(ext(file?.name))) return "document";
  return "fichier";
}

/** Aperçu court (liste des conversations). */
export function apercuPiece(pj) {
  if (!pj || typeof pj !== "object") return "";
  switch (pj.genre) {
    case "vocal": return "🎤 Message vocal";
    case "image": return "📷 Photo";
    case "video": return "🎬 Vidéo";
    case "audio": return "🎵 Audio";
    case "document": return `📄 ${pj.nom || "Document"}`;
    default: return `📎 ${pj.nom || "Fichier"}`;
  }
}

/** « 0:07 », « 9:59 », « 1:02:03 ». */
export function formatDuree(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Extension du fichier d'un message vocal selon le type enregistré (le serveur reconnaît l'audio par l'extension). */
export function extensionVocal(mime) {
  const t = String(mime || "").toLowerCase();
  if (t.includes("mp4") || t.includes("aac") || t.includes("m4a")) return "m4a";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("wav")) return "wav";
  return "weba"; // audio/webm (Android, Chrome) : « .webm » serait pris pour une vidéo
}

/** Type d'enregistrement accepté par l'appareil, du meilleur au plus courant. */
export function typeEnregistrement(supporte = () => false) {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((t) => supporte(t)) || "";
}

/**
 * Barres de l'onde d'un message vocal, toujours les mêmes pour un même message (graine = son identifiant).
 * Valeurs entre 0.2 et 1.
 */
export function ondeDe(graine, n = 28) {
  let h = 2166136261;
  for (const c of String(graine || "chay")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
    const brut = (h % 1000) / 1000;
    const enveloppe = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / n);
    return Math.round((0.2 + 0.8 * brut * enveloppe) * 100) / 100;
  });
}

/** Le message a-t-il quelque chose à montrer ? (texte, photo ou pièce jointe) */
export const aPieceJointe = (m) => Boolean(m && m.piece_jointe && typeof m.piece_jointe === "object" && m.piece_jointe.url);
