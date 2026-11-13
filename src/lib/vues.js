// Compteur de vues du multimédia, façon YouTube (lot E) :
//  - audio et vidéo (Musique, Prédication, Films, Votre Playlist, YouTube) : +1 à la MOITIÉ de la lecture ;
//  - article et actualité : +1 après 2 minutes de lecture (onglet visible) ;
//  - une seule fois par ouverture côté app ; le serveur (route compterVue) ignore en plus une nouvelle vue du même
//    membre sur le même contenu pendant 30 minutes (ouvertures courtes répétées).
// Ce fichier est pur (testé par node --test) ; l'appel serveur est dans src/hooks/useCompteurVues.js.

export const TYPES_VUE = ["piste", "youtube", "article", "actualite"];
export const LECTURE_MIN_MS = 2 * 60 * 1000;

export const cleVue = (vue) => (vue && TYPES_VUE.includes(vue.type) && vue.id ? `${vue.type}:${vue.id}` : null);

/** « 1 vue », « 845 vues », « 1,2 k vues », « 3 M vues » ; null pour 0 (affichage discret : rien). */
export function formatVues(n, unite = "vue") {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return null;
  const pluriel = `${unite}s`;
  if (v === 1) return `1 ${unite}`;
  if (v < 1000) return `${v} ${pluriel}`;
  const [div, suffixe] = v < 1e6 ? [1e3, "k"] : [1e6, "M"];
  const court = (Math.floor((v / div) * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${court} ${suffixe} ${pluriel}`;
}

/**
 * Suivi « moitié atteinte » : renvoie une fonction (ouverture, vue, temps, durée) qui appelle onMoitie(vue) une
 * seule fois par ouverture. Une ouverture = une valeur (identifiant du lecteur, de la file…) ; changer d'ouverture
 * ou de contenu réarme le suivi.
 */
export function creerSuiviMoitie(onMoitie) {
  let ouvertureCourante;
  let cleCourante = null;
  let compte = false;
  return (ouverture, vue, temps, duree) => {
    const cle = cleVue(vue);
    if (!cle) return false;
    if (ouverture !== ouvertureCourante || cle !== cleCourante) {
      ouvertureCourante = ouverture;
      cleCourante = cle;
      compte = false;
    }
    if (compte || !(duree > 0) || !(temps >= duree / 2)) return false;
    compte = true;
    onMoitie(vue);
    return true;
  };
}

// ── Compteurs connus de l'app (réponse du serveur), pour un affichage à jour sans recharger ─────────────
const compteurs = new Map();
const abonnes = new Set();

export function noterCompteur(vue, n) {
  const cle = cleVue(vue);
  const v = Math.floor(Number(n));
  if (!cle || !Number.isFinite(v) || v < 0) return;
  compteurs.set(cle, v);
  abonnes.forEach((f) => f(cle, v));
}

/** Compteur à afficher : celui renvoyé par le serveur pendant la session, sinon celui de l'enregistrement. */
export function compteurDe(vue, base) {
  const cle = cleVue(vue);
  return cle && compteurs.has(cle) ? Math.max(compteurs.get(cle), Number(base) || 0) : Number(base) || 0;
}

export function abonnerCompteurs(f) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}
