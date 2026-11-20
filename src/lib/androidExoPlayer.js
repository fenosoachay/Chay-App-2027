import { Capacitor, registerPlugin } from "@capacitor/core";

const AndroidExoPlayer = registerPlugin("AndroidExoPlayer");
let activeMediaKey = null;

const getMediaKey = (source, mediaType) => `${mediaType || "audio"}\u0000${source || ""}`;

export function isAndroidExoPlayerAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function playWithAndroidExoPlayer(media) {
  activeMediaKey = getMediaKey(media.url, media.mediaType);
  return AndroidExoPlayer.playMedia(media);
}

export function pauseAndroidExoPlayer() {
  return AndroidExoPlayer.pauseMedia();
}

export function resumeAndroidExoPlayer() {
  return AndroidExoPlayer.resumeMedia();
}

export function seekAndroidExoPlayer(positionSeconds) {
  return AndroidExoPlayer.seekMedia({ positionSeconds });
}

export function stopAndroidExoPlayer(source, mediaType) {
  if (source && activeMediaKey !== getMediaKey(source, mediaType)) return Promise.resolve();
  activeMediaKey = null;
  return AndroidExoPlayer.stopMedia();
}

export function setAndroidExoPlayerVolume(volume) {
  return AndroidExoPlayer.setVolume({ volume });
}

/** Nouvel ordre de la file native (identifiants queueId) sans interrompre le titre en cours. */
export function reorderAndroidExoPlayerQueue(queueIds) {
  return AndroidExoPlayer.reorderQueue({ queueIds });
}

/** Lecture non-stop (Votre Playlist) : fondu enchaîné de 5 s entre les titres, fait par le lecteur Android. */
export function setAndroidFondu(actif) {
  return AndroidExoPlayer.setFondu({ actif: Boolean(actif) });
}

export function setAndroidExoPlayerRepeatMode(mode) {
  return AndroidExoPlayer.setRepeatMode({ mode });
}

export function setAndroidExoPlayerVideoBounds(bounds) {
  return AndroidExoPlayer.setVideoBounds(bounds);
}

/** Plein écran vidéo (paysage, commandes du lecteur Android). */
export function setAndroidExoPlayerFullscreen(active) {
  return AndroidExoPlayer.setFullscreen({ active: Boolean(active) });
}

/** Plein écran de la page (lecteur YouTube) : paysage et barres du téléphone masquées. */
export function setAndroidImmersif(active) {
  return AndroidExoPlayer.setImmersif({ active: Boolean(active) });
}

/** Sortie du plein écran par le lecteur Android lui-même ({ active: false }). */
export function subscribeAndroidExoPlayerFullscreen(listener) {
  return AndroidExoPlayer.addListener("fullscreen", listener);
}

export function subscribeAndroidExoPlayer(listener) {
  return AndroidExoPlayer.addListener("playbackState", listener);
}
