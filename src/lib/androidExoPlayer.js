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

export function setAndroidExoPlayerVideoBounds(bounds) {
  return AndroidExoPlayer.setVideoBounds(bounds);
}

export function subscribeAndroidExoPlayer(listener) {
  return AndroidExoPlayer.addListener("playbackState", listener);
}
