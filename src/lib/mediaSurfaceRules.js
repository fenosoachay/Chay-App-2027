// Règles du lecteur plein écran (UniversalMediaSurface).
// L'audio (musique, prédications, Bible) et la RADIO se jouent sur leur propre page : jamais de plein écran.
// La radio garde son son, son tampon, sa lecture en arrière-plan et sa notification Android (RadioContext /
// publishMediaControl) : seul l'affichage plein écran est retiré.

export const AUDIO_TYPES = new Set(["audio", "music", "sermon", "sermons", "predication", "bible"]);

export const isAudioControl = (control) => AUDIO_TYPES.has(control?.type) || control?.engine === "audio";

/** Le lecteur plein écran peut-il s'afficher pour ce contrôle ? (vidéo et YouTube seulement) */
export const allowsFullPlayer = (control) => Boolean(control) && !isAudioControl(control) && control.type !== "radio";

/** Une demande de lecture de ce type ouvre-t-elle le plein écran ? */
export const opensFullPlayerOnRequest = (type) => type === "video" || type === "youtube";

// YouTube est lu DANS l'app partout (APK : page relais, voir src/lib/youtubeEmbed.js) ; ce lien ne sert
// qu'au repli « Ouvrir dans YouTube » quand la lecture intégrée échoue.
/** Adresse de la vidéo pour l'application YouTube (lien universel youtube.com). */
export const youtubeWatchUrl = (videoId) => `https://www.youtube.com/watch?v=${encodeURIComponent(String(videoId || ""))}`;

/** Lecteur YouTube réduit (passage plein écran -> réduit) : la vidéo doit s'arrêter, pas jouer en caché. */
export const doitArreterYoutubeReduit = (control, etaitAffiche, estAffiche) =>
  control?.type === "youtube" && Boolean(etaitAffiche) && !estAffiche;

/**
 * Classes de la balise <video> du lecteur commun. Dans l'APK, l'image des vidéos vient de la vue native ExoPlayer
 * (la balise ne sert qu'à mesurer l'emplacement) : invisible mais présente pour une vidéo, et RETIRÉE de la mise en
 * page sinon. Sans cela, pour YouTube, la balise invisible occupait tout le cadre et poussait l'iframe sous le bord
 * (overflow-hidden) : son présent, image noire.
 */
export function classeVideoLecteur({ isNativeAndroidPlayer, isVideo }) {
  if (!isVideo) return "hidden";
  return isNativeAndroidPlayer ? "block opacity-0" : "block";
}
