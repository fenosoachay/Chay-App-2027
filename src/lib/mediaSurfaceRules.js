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

// YouTube : dans l'APK Android, l'intégration (iframe, origine https://localhost) est refusée ou ne montre
// que le son ; la vidéo s'ouvre donc dans l'application YouTube (ou le navigateur). Le site web garde
// la lecture intégrée.
export const youtubeEnApplicationExterne = (platform) => platform === "android";

/** Adresse de la vidéo pour l'application YouTube (lien universel youtube.com). */
export const youtubeWatchUrl = (videoId) => `https://www.youtube.com/watch?v=${encodeURIComponent(String(videoId || ""))}`;

/** Lecteur YouTube réduit (passage plein écran -> réduit) : la vidéo doit s'arrêter, pas jouer en caché. */
export const doitArreterYoutubeReduit = (control, etaitAffiche, estAffiche) =>
  control?.type === "youtube" && Boolean(etaitAffiche) && !estAffiche;
