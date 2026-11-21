// Affichage d'une playlist de la section Vidéo (1.3.23) :
//  - « film »     : liste de films, affiches en grille (AffichesFilms) ;
//  - « vertical » : défilement plein écran façon TikTok (❤️, Partager, Son, Vues à droite).
// La LECTURE, elle, suit le format de chaque vidéo (lib/infosVideo) : 16:9 -> lecteur film, 9:16 -> vertical.
// Choisi par l'admin à la création (CreatePlaylistModal). Anciennes playlists sans réglage : « Drôle » et
// « Mindset » défilent (la migration 1.3.23 l'enregistre aussi), les autres en liste de films.
export const AFFICHAGES = [
  { value: "film", label: "Liste de films", description: "Affiches en grille ; chaque vidéo se lit à son format" },
  { value: "vertical", label: "Défilement", description: "Plein écran vertical, on fait défiler (TikTok)" },
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
