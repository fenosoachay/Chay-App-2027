// Demande d'ouverture du lecteur plein écran (sans toucher à la lecture).
export const OPEN_PLAYER_EVENT = "chay-open-audio-player";

export function requestOpenAudioPlayer() {
  window.dispatchEvent(new CustomEvent(OPEN_PLAYER_EVENT));
}