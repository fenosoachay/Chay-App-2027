// Bible › « Sagesse en audio » : Proverbes (31 chapitres) et Ecclésiaste (12), un audio par chapitre (collection
// BibleAudio, fichiers sur R2). Lecture par le lecteur global (même lecteur que Musique / Prédication).
// 1.3.8 : les Psaumes sont retirés (remplacés par l'Ecclésiaste).
// Fichier pur : testé par node --test ; le script d'envoi en masse (pocketbase/scripts/envoyer-bible-audio.mjs)
// utilise les mêmes règles de nommage.

// `fichier` : préfixe ASCII des noms de fichiers (« Ecclesiaste-01.mp3 », sans accent).
export const LIVRES_SAGESSE = [
  { id: "proverbes", nom: "Proverbes", fichier: "Proverbes", chapitres: 31 },
  { id: "ecclesiaste", nom: "Ecclésiaste", fichier: "Ecclesiaste", chapitres: 12 },
];

export const livreSagesse = (id) => LIVRES_SAGESSE.find((l) => l.id === id) || null;

/** Chapitre valide pour ce livre ? */
export function chapitreValide(livreId, chapitre) {
  const l = livreSagesse(livreId);
  const n = Number(chapitre);
  return Boolean(l) && Number.isInteger(n) && n >= 1 && n <= l.chapitres;
}

/** Écran d'un chapitre (notification de lecture, lien direct). */
export const routeChapitre = (livreId, chapitre) => `/bible?view=sagesse&livre=${livreId}&chapitre=${chapitre}`;

/** Lignes BibleAudio d'un livre -> Map(chapitre -> ligne), en ignorant les lignes invalides ou sans audio. */
export function audiosParChapitre(rows, livreId) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.book !== livreId || !chapitreValide(livreId, r.chapter)) continue;
    if (!/^https?:\/\//.test(String(r.audio_url || ""))) continue;
    m.set(Number(r.chapter), r);
  }
  return m;
}

/**
 * File de lecture d'un livre : chapitres ayant un audio, dans l'ordre (lecture enchaînée au chapitre suivant
 * disponible). Éléments au format du lecteur global (mediaType « bible », route de l'écran du chapitre).
 */
export function fileSagesse(livreId, rows) {
  const l = livreSagesse(livreId);
  if (!l) return [];
  return [...audiosParChapitre(rows, livreId).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapitre, r]) => ({
      id: r.id,
      title: `${l.nom} ${chapitre}`,
      artist: "Sagesse en audio",
      audio_url: r.audio_url,
      cover_url: null,
      mediaType: "bible",
      livre: livreId,
      chapitre,
      route: routeChapitre(livreId, chapitre),
    }));
}

/**
 * Nom de fichier du dépôt en masse -> { livre, chapitre } ou null.
 * Formats acceptés : « Proverbes-01.mp3 », « Ecclesiaste-01.mp3 » (zéros de tête facultatifs, casse et accents
 * ignorés : « ecclesiaste-01.mp3 », « Ecclésiaste-1.mp3 »).
 */
export function lireNomFichierAudio(nom) {
  const simple = String(nom || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = /^(proverbes|ecclesiaste)-0*(\d{1,3})\.mp3$/i.exec(simple);
  if (!m) return null;
  const livre = m[1].toLowerCase();
  const chapitre = Number(m[2]);
  return chapitreValide(livre, chapitre) ? { livre, chapitre } : null;
}

/** Nom normalisé d'un chapitre : « Proverbes-01.mp3 », « Ecclesiaste-12.mp3 » (autant de chiffres que le dernier chapitre). */
export function nomFichierAudio(livreId, chapitre) {
  const l = livreSagesse(livreId);
  if (!l || !chapitreValide(livreId, chapitre)) return null;
  return `${l.fichier}-${String(chapitre).padStart(String(l.chapitres).length, "0")}.mp3`;
}
