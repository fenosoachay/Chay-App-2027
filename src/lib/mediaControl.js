const controls = new Map();
const publishedIds = new Map();
let activeId = null;
const listeners = new Set();
const playbackRequestListeners = new Set();

function getActiveControl() {
  return activeId ? controls.get(activeId) || null : null;
}

function notify() {
  const control = getActiveControl();
  listeners.forEach((listener) => listener(control));
}

export function subscribeMediaControl(listener) {
  listeners.add(listener);
  listener(getActiveControl());
  return () => listeners.delete(listener);
}

export function subscribeMediaPlaybackRequests(listener) {
  playbackRequestListeners.add(listener);
  return () => playbackRequestListeners.delete(listener);
}

export function getMediaControlKey(control) {
  if (!control) return null;
  return `${String(control.id)}:${String(control.source || "")}`;
}

export function registerMediaControl(control) {
  const id = Symbol(control.type);
  if (control.isPlaying) stopPreviousControl(id);
  controls.set(id, { ...control, id });
  activeId = id;
  notify();
  const dispose = () => {
    controls.delete(id);
    if (activeId === id) {
      activeId = null;
      notify();
    }
  };
  dispose.id = id;
  return dispose;
}

export function updateMediaControl(id, updates) {
  const current = controls.get(id);
  if (!current) return;
  controls.set(id, { ...current, ...updates });
  if (updates.isPlaying === true) activeId = id;
  if (activeId === id) notify();
}

export function stopActiveMediaControl() {
  const control = getActiveControl();
  control?.stop();
  if (control?.id) clearMediaControl(control.id);
}

export function clearMediaControl(id) {
  controls.delete(id);
  for (const [owner, publishedId] of publishedIds) {
    if (publishedId === id) publishedIds.delete(owner);
  }
  if (activeId === id) {
    activeId = null;
    notify();
  }
}

export function publishMediaControl(control, owner = control.type) {
  let id = publishedIds.get(owner);
  const current = id ? controls.get(id) : null;
  if (!current) {
    id = Symbol(owner);
    publishedIds.set(owner, id);
  }
  if (control.isPlaying) {
    stopPreviousControl(id);
    for (const [otherId] of controls) {
      if (otherId !== id) controls.delete(otherId);
    }
    for (const [otherOwner, publishedId] of publishedIds) {
      if (publishedId !== id) publishedIds.delete(otherOwner);
    }
    activeId = id;
  }
  controls.set(id, { ...current, ...control, id, owner });
  if ((!activeId || !controls.has(activeId)) && (control.isPlaying || current)) activeId = id;
  if (activeId === id) notify();
  return id;
}

export function requestMediaPlayback(control, owner = control.type) {
  // IMPORTANT : on ne renvoie JAMAIS l'objet stocké aux appelants. Le contrôle
  // est muté par updateMediaControl() via `controls.set(id, {...})` ; exposer la
  // référence interne reviendrait à laisser un composant lire un état périmé.
  const id = publishMediaControl(control, owner);
  const active = controls.get(id);
  if (active) {
    // Double notification volontairement évitée : `publishMediaControl` a déjà
    // appelé notify(), les abonnés à l'ÉTAT sont donc à jour. Seuls les
    // demandeurs de lecture (le lecteur persistant) sont prévenus ici.
    playbackRequestListeners.forEach((listener) => listener({ ...active }));
  }
  return id;
}

function stopPreviousControl(nextId) {
  if (!activeId || activeId === nextId) return;
  const previous = getActiveControl();
  if (!previous) return;
  if (typeof previous.stop === "function") previous.stop();
  if (activeId === previous.id) clearMediaControl(previous.id);
}
