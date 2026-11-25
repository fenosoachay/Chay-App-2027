// 1.3.34 : playlists « Mindset » (Multimédia › Vidéo et Galerie) : pas de notification automatique à l'ajout.
// L'admin décide : bouton 🔔 sur le contenu -> « Chay attire ton attention sur cette vidéo / photo : … ».
const simplifier = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export const ENTITES_ATTENTION = { Video: "video", GalleryImage: "photo" };

/** Vrai si la playlist (ou sa playlist parente) s'appelle « Mindset ». `libelle` : « Playlist › Sous-playlist ». */
export function estMindset(libelle) {
  return String(libelle || "").split("›").some((p) => simplifier(p) === "mindset");
}

/** Notification automatique à l'ajout ? Non pour une vidéo ou une photo rangée dans Mindset. */
export function notifierAutomatiquement(entity, libellePlaylist) {
  return !(ENTITES_ATTENTION[entity] && estMindset(libellePlaylist));
}

export const PREFIXE_ATTENTION = "Chay attire ton attention sur";

/** Texte de la notification manuelle. */
export function texteAttention(entity, titre) {
  const quoi = ENTITES_ATTENTION[entity] === "photo" ? "cette photo" : "cette vidéo";
  const t = String(titre || "").trim();
  return t ? `${PREFIXE_ATTENTION} ${quoi} : « ${t} ».` : `${PREFIXE_ATTENTION} ${quoi}.`;
}
