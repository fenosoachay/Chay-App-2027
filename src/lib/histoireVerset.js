// Petite Histoire du verset du jour (1.3.22) : calculs purs (testés par node --test).
//  - type : "video" | "audio" | "texte" ; sans histoire -> message « Une petite histoire vous attend la prochaine fois. »
//  - bouton de fin : « Vu » (vidéo), « Entendu » (audio), « Lu » (texte), actif seulement à la fin ;
//  - « déjà vue » : identifiant du verset dans users.histoires_vues (serveur) ou dans ce téléphone (en attendant).

export const MESSAGE_SANS_HISTOIRE = "Une petite histoire vous attend la prochaine fois.";
const CLE_LOCALE = "chay_histoires_vues";

/** L'histoire d'un verset du jour, ou null s'il n'y en a pas (ou si elle est incomplète). */
export function histoireDe(devotional) {
  if (!devotional) return null;
  const type = devotional.histoire_type;
  const titre = String(devotional.histoire_titre || "").trim();
  if ((type === "video" || type === "audio") && String(devotional.histoire_url || "").trim()) {
    return { type, titre, url: String(devotional.histoire_url).trim() };
  }
  if (type === "texte" && String(devotional.histoire_texte || "").trim()) {
    return { type, titre, texte: String(devotional.histoire_texte).trim() };
  }
  return null;
}

/** Texte du bouton de fin. */
export function libelleFin(type) {
  if (type === "video") return "Vu";
  if (type === "audio") return "Entendu";
  if (type === "texte") return "Lu";
  return "OK";
}

/** Texte lu jusqu'en bas ? (tolérance de quelques pixels) */
export function finDuTexte({ scrollTop = 0, clientHeight = 0, scrollHeight = 0 } = {}) {
  return scrollHeight - (scrollTop + clientHeight) <= 8;
}

function lireLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_LOCALE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Déjà vue (Vu / Entendu / Lu / OK touché) pour ce verset ? */
export function dejaVue(devotionalId, user) {
  if (!devotionalId) return true;
  const serveur = Array.isArray(user?.histoires_vues) ? user.histoires_vues : [];
  return serveur.includes(devotionalId) || lireLocal().includes(devotionalId);
}

/** Note localement (immédiat, même hors ligne) ; le serveur est prévenu à part (route histoireVue). */
export function noterVueLocale(devotionalId) {
  try {
    const v = lireLocal().filter((x) => x !== devotionalId);
    v.push(devotionalId);
    localStorage.setItem(CLE_LOCALE, JSON.stringify(v.slice(-500)));
  } catch {
    /* stockage indisponible : le serveur garde l'information */
  }
}
