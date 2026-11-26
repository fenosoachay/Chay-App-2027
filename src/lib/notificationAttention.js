// 1.3.34 : playlists « Mindset » (Multimédia › Vidéo et Galerie) : pas de notification automatique à l'ajout.
// 1.3.36 : « Pédagogie en image » aussi.
// L'admin décide : bouton 🔔 sur le contenu -> « Chay attire ton attention sur cette vidéo / photo : … ».
// 1.3.43 : Mindset et Pédagogie en image ont AUSSI la notification automatique à l'ajout (comme les autres
// contenus) ; le bouton 🔔 reste pour attirer l'attention à nouveau quand l'admin le veut.
const simplifier = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// 1.3.43 : bouton 🔔 sur TOUS les contenus. Pour chacun : genre de notification (lib/adminNotify.js) et
// « sur quoi » Chay attire l'attention.
export const ENTITES_ATTENTION = {
  MusicTrack: { kind: "music", quoi: "ce chant" },
  Sermon: { kind: "sermon", quoi: "cette prédication" },
  Video: { kind: "film", quoi: "cette vidéo" },
  VideoEnfant: { kind: "film_enfant", quoi: "cette vidéo de Chay Enfants" },
  YouTubeVideo: { kind: "youtube", quoi: "cette vidéo" },
  Article: { kind: "article", quoi: "cet article" },
  GalleryImage: { kind: "gallery", quoi: "cette photo" },
  Paroles: { kind: "paroles", quoi: "ces paroles" },
  Verset: { kind: "verset", quoi: "ce verset" },
  Announcement: { kind: "annonce", quoi: "cette annonce" },
};

// 1.3.36 : même règle pour « Pédagogie en image(s) » (Galerie).
export const PLAYLISTS_MANUELLES = ["mindset", "pedagogieenimage", "pedagogieenimages"];

/**
 * Vrai si la playlist (ou sa playlist parente) est notifiée seulement à la main : « Mindset » ou
 * « Pédagogie en image(s) ». `libelle` : « Playlist › Sous-playlist ».
 */
export function estMindset(libelle) {
  return String(libelle || "").split("›").some((p) => PLAYLISTS_MANUELLES.includes(simplifier(p)));
}

/** Notification automatique à l'ajout ? Oui pour tout contenu, Mindset compris (1.3.43 : automatique ET manuelle). */
export function notifierAutomatiquement(entity, libellePlaylist) {
  return true;
}

export const PREFIXE_ATTENTION = "Chay attire ton attention sur";

/** Texte de la notification manuelle (bouton 🔔). `genre` : « reunion » pour une réunion (Announcement). */
export function texteAttention(entity, titre, genre) {
  const quoi = genre === "reunion" ? "cette réunion" : ENTITES_ATTENTION[entity]?.quoi || "ce contenu";
  const t = String(titre || "").trim();
  return t ? `${PREFIXE_ATTENTION} ${quoi} : « ${t} ».` : `${PREFIXE_ATTENTION} ${quoi}.`;
}
