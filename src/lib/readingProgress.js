// Progression de lecture de la Bible, mémorisée par version (FR / MG).
// Stockée localement (fonctionne hors ligne) puis synchronisée sur le compte
// de l'utilisateur connecté (champ `bible_progress`, une entrée par version).
import { base44 } from "@/api/base44Client";

const KEY = "chay_bible_progress_v1";

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function getLocalProgress(versionId) {
  return readAll()[versionId] || null;
}

// p = { book, chapter, verse, at }
export function saveLocalProgress(versionId, p) {
  const all = readAll();
  all[versionId] = { ...p, at: p.at || Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible */
  }
  return all[versionId];
}

// Envoie la progression d'une version au compte (fusionne avec les autres versions).
export async function pushProgress(versionId, p) {
  const me = await base44.auth.me();
  const remote = me?.bible_progress && typeof me.bible_progress === "object" ? me.bible_progress : {};
  if (remote[versionId]?.at && remote[versionId].at > p.at) return; // le serveur est plus récent
  await base44.auth.updateMe({ bible_progress: { ...remote, [versionId]: p } });
}

// Retourne la progression la plus récente entre l'appareil et le compte.
export async function loadProgress(versionId, user) {
  const local = getLocalProgress(versionId);
  const remote = user?.bible_progress?.[versionId] || null;
  if (remote && (!local || (remote.at || 0) > (local.at || 0))) {
    saveLocalProgress(versionId, remote);
    return remote;
  }
  return local;
}