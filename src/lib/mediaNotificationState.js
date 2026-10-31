export function createMediaNotificationState(control) {
  if (!control) return null;

  return {
    title: control.title || "Média",
    artist: control.subtitle || "CHAY",
    artworkUrl: control.artwork || "",
    isPlaying: Boolean(control.isPlaying),
    isBuffering: Boolean(control.isBuffering),
    currentTime: Math.max(0, Number(control.currentTime) || 0),
    duration: Math.max(0, Number(control.duration) || 0),
    isLive: Boolean(control.isLive),
    hasPrevious: Boolean(control.previous),
    hasNext: Boolean(control.next),
  };
}

export function shouldShowMediaNotification(control, notificationStarted) {
  return Boolean(control && (control.isPlaying || notificationStarted));
}

export function dispatchMediaNotificationAction(control, action, details = {}) {
  if (!control) return false;

  if (action === "play") {
    if (control.isLive) control.play?.();
    else if (!control.isPlaying) (control.play || control.toggle)?.();
    return true;
  }
  if (action === "pause") {
    if (control.isLive) control.stop?.();
    else if (control.isPlaying) (control.pause || control.toggle)?.();
    return true;
  }
  if (action === "next") {
    control.next?.();
    return Boolean(control.next);
  }
  if (action === "previous") {
    control.previous?.();
    return Boolean(control.previous);
  }
  if (action === "stop") {
    control.stop?.();
    return Boolean(control.stop);
  }
  if (action === "seek") {
    if (!control.seek || !(control.duration > 0)) return false;
    const position = Number(details.position);
    if (!Number.isFinite(position)) return false;
    control.seek(Math.max(0, Math.min(control.duration, position)));
    return true;
  }
  return false;
}
