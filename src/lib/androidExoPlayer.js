import { Capacitor, registerPlugin } from "@capacitor/core";

const AndroidExoPlayer = registerPlugin("AndroidExoPlayer");

export function isAndroidExoPlayerAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function playWithAndroidExoPlayer(media) {
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

export function stopAndroidExoPlayer() {
  return AndroidExoPlayer.stopMedia();
}

export function setAndroidExoPlayerVideoBounds(bounds) {
  return AndroidExoPlayer.setVideoBounds(bounds);
}

export function subscribeAndroidExoPlayer(listener) {
  return AndroidExoPlayer.addListener("playbackState", listener);
}
