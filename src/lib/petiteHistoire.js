// Petite histoire (1.3.25) : pop-up occasionnel publié par les admins (vidéo, photo ou texte), indépendant du verset
// du jour. Elle s'ouvre à l'ouverture de l'app jusqu'à ce que le membre touche « Ok » ; ensuite elle ne revient
// plus (sur tous ses appareils : users.histoires_vues, identifiant « ph_<id> »). Fichier pur, testé par node --test.

const CLE_LOCALE = "chay_petites_histoires_vues";
export const cleVue = (id) => `ph_${id}`;

/** L'histoire est-elle complète ? (vidéo/photo : un fichier ; texte : un texte) */
export function histoireValide(h) {
  if (!h || !h.actif) return false;
  if (h.type === "video" || h.type === "photo") return /^https?:\/\//.test(String(h.media_url || "").trim());
  if (h.type === "texte") return Boolean(String(h.texte || "").trim());
  return false;
}

function lireLocal(stockage) {
  try {
    const v = JSON.parse(stockage?.getItem(CLE_LOCALE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function noterVueLocale(id, stockage = globalThis.localStorage) {
  try {
    const vues = lireLocal(stockage).filter((x) => x !== cleVue(id));
    vues.push(cleVue(id));
    stockage?.setItem(CLE_LOCALE, JSON.stringify(vues.slice(-200)));
  } catch {
    /* stockage indisponible */
  }
}

/** La plus récente histoire en ligne que ce membre n'a pas encore validée, ou null. */
export function histoireAMontrer(histoires, user, stockage = globalThis.localStorage) {
  const vues = new Set([...(Array.isArray(user?.histoires_vues) ? user.histoires_vues : []), ...lireLocal(stockage)]);
  const liste = (Array.isArray(histoires) ? histoires : [])
    .filter(histoireValide)
    .sort((a, b) => String(b.created || b.created_date || "").localeCompare(String(a.created || a.created_date || "")));
  return liste.find((h) => !vues.has(cleVue(h.id))) || null;
}

// Formats que les téléphones savent lire : les autres (avi, wmv, flv…) sont acceptés à l'envoi mais l'admin est
// prévenu qu'ils risquent de ne pas se lire.
const LISIBLES = ["mp4", "m4v", "mov", "webm", "3gp", "mkv"];
export function videoLisiblePartout(url) {
  const ext = (/\.([a-z0-9]{1,5})(?:$|[?#])/i.exec(String(url || "")) || [])[1];
  return !ext || LISIBLES.includes(ext.toLowerCase());
}
