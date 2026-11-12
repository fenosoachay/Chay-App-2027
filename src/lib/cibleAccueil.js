// Cible d'une notification ouverte sur l'accueil (routes de routesNotification.js).
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** ?verset= / ?annonce= / ?contenu= -> { collection, id } ou null. */
export function cibleAccueil(params) {
  const get = (k) => (params && typeof params.get === "function" ? params.get(k) : null);
  for (const [cle, collection] of [["verset", "Devotional"], ["annonce", "Announcement"], ["contenu", "Content"]]) {
    const id = get(cle);
    if (id && ID_RE.test(id)) return { collection, id };
  }
  return null;
}

/** Annonce de réunion (type event, comme ProchaineReunionSection) ou annonce simple. */
export const libelleAnnonce = (a) => (a && a.type === "event" ? "Réunion" : "Annonce");

/** Date du jour (fuseau de l'appareil), AAAA-MM-JJ. */
const aujourdHui = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/**
 * Annonce / réunion : notification seulement si sa date de publication est aujourd'hui ou passée
 * (une annonce programmée pour plus tard n'est pas encore visible sur l'accueil).
 */
export function annonceVisibleMaintenant(date, now = new Date()) {
  const jour = String(date || "").slice(0, 10);
  return !jour || jour <= aujourdHui(now);
}

/** Genre de notification d'une annonce : réunion (type event) ou annonce. */
export const genreAnnonce = (annonce) => (annonce && annonce.type === "event" ? "reunion" : "annonce");
