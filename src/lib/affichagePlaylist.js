// Affichage d'une playlist de la section Vidéo (1.3.23) :
//  - « film »     : lecture classique 16:9 ;
//  - « vertical » : plein écran 9:16 façon TikTok (❤️, Partager, Son, Vues à droite).
// Choisi par l'admin à la création (CreatePlaylistModal). Anciennes playlists sans réglage : « Drôle » et
// « Mindset » sont verticales (la migration 1.3.23 l'enregistre aussi), les autres en 16:9.
export const AFFICHAGES = [
  { value: "film", label: "Film", format: "16:9", description: "Lecture classique, écran large" },
  { value: "vertical", label: "TikTok", format: "9:16", description: "Plein écran vertical, on fait défiler" },
];

const NOMS_VERTICAUX = ["drole", "mindset"];
const simplifier = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Vrai si la playlist se lit en vertical (9:16). */
export function estVerticale(p) {
  if (!p) return false;
  if (p.affichage === "vertical") return true;
  if (p.affichage === "film") return false;
  return NOMS_VERTICAUX.includes(simplifier(p.name));
}

/** Réglage à proposer quand on modifie une playlist (réglage enregistré, sinon celui déduit du nom). */
export const affichageDe = (p) => (estVerticale(p) ? "vertical" : "film");
