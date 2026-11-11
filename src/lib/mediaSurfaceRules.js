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
