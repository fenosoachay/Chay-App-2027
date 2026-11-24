// Tableau de bord de l'app (1.3.25) : ce que l'app envoie au serveur (POST /api/chay/activite), environ une fois
// par minute tant qu'elle est à l'écran : secondes passées (écran visible seulement), pages ouvertes par section,
// et une fois par jour la position ARRONDIE à ~5 km (la ville, jamais l'adresse). Fichier pur, testé par node --test.

/** Section d'une adresse de l'app (mêmes identifiants que le serveur, lib/activite.js). */
export function sectionDe(pathname) {
  const p = String(pathname || "/").toLowerCase();
  if (p === "/" || p === "") return "accueil";
  const premier = p.split("/").filter(Boolean)[0] || "";
  const table = {
    bible: "bible",
    media: "media",
    games: "jeux", puzzle: "jeux", quiz: "jeux", "word-scramble": "jeux", "personality-quiz": "jeux", "block-blast": "jeux",
    kids: "enfants",
    community: "communaute", profile: "communaute",
    messages: "messages",
    requests: "requetes",
    donate: "don", don: "don",
    contact: "contact",
    eglise: "eglise",
    notifications: "notifications",
    settings: "reglages",
    admin: "admin",
  };
  return table[premier] || null;
}

export const PAS_POSITION = 0.05; // degrés (~5 km)

/** Coordonnée arrondie au pas de la ville (null si invalide). */
export function arrondirCoord(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.round(n / PAS_POSITION) * PAS_POSITION * 100) / 100;
}

/** Accumulateur : temps visible et sections, vidé seulement quand le serveur a bien enregistré l'envoi. */
export function creerCompteur(maintenant = () => Date.now()) {
  let depuis = null; // début de la période visible en cours
  let secondes = 0;
  let sections = {};
  return {
    visible(estVisible) {
      if (estVisible && depuis === null) depuis = maintenant();
      if (!estVisible && depuis !== null) {
        secondes += (maintenant() - depuis) / 1000;
        depuis = null;
      }
    },
    page(pathname) {
      const s = sectionDe(pathname);
      if (s) sections[s] = (sections[s] || 0) + 1;
    },
    /** Données à envoyer (sans rien vider). */
    lire() {
      const enCours = depuis !== null ? (maintenant() - depuis) / 1000 : 0;
      return { secondes: Math.min(120, Math.floor(secondes + enCours)), sections: { ...sections } };
    },
    /** Après un envoi réussi : retire ce qui a été envoyé. */
    confirmer(envoye) {
      if (depuis !== null) {
        secondes += (maintenant() - depuis) / 1000;
        depuis = maintenant();
      }
      // Hors connexion longtemps : on ne garde pas plus de 10 minutes en attente.
      secondes = Math.min(600, Math.max(0, secondes - envoye.secondes));
      const reste = {};
      for (const [k, n] of Object.entries(sections)) {
        const r = n - (envoye.sections[k] || 0);
        if (r > 0) reste[k] = r;
      }
      sections = reste;
    },
  };
}

const CLE_POSITION = "chay_position_jour";

/** Vrai si la position n'a pas encore été envoyée aujourd'hui (date de l'appareil). */
export function positionAEnvoyer(jour, stockage = globalThis.localStorage) {
  try {
    return stockage?.getItem(CLE_POSITION) !== jour;
  } catch {
    return false;
  }
}

export function notePositionEnvoyee(jour, stockage = globalThis.localStorage) {
  try {
    stockage?.setItem(CLE_POSITION, jour);
  } catch {
    /* stockage indisponible */
  }
}

/** Réglage « Apparaître sur la carte » changé : la ville (ou son effacement) repart au prochain envoi. */
export function oublierPositionDuJour(stockage = globalThis.localStorage) {
  try {
    stockage?.removeItem(CLE_POSITION);
  } catch {
    /* stockage indisponible */
  }
}
