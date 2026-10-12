// Sonde l'état de la localisation de l'appareil, indépendamment du réseau.
// `nav` est injectable pour les tests (sinon `navigator` global).
//
// Principe : ne bloquer l'application QUE sur une preuve certaine que la
// localisation est coupée. Un délai dépassé, une position momentanément
// indisponible ou une API Permissions capricieuse (fréquent dans les WebView)
// ne doivent jamais fermer l'application alors que la localisation est activée.
const GRANTED_KEY = "chay_location_granted";

function getNavigator() {
  return typeof navigator !== "undefined" ? navigator : undefined;
}

export function isGeolocationSupported(nav = getNavigator()) {
  return !!nav?.geolocation;
}

// Mémoire d'une autorisation déjà constatée (survit aux relances de l'app).
export function wasLocationGranted() {
  try {
    return localStorage.getItem(GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberLocationGranted(granted) {
  try {
    if (granted) localStorage.setItem(GRANTED_KEY, "1");
    else localStorage.removeItem(GRANTED_KEY);
  } catch {
    /* stockage indisponible : sans effet */
  }
}

// Résultat : "active" | "denied" | "inactive" | "unsupported"
//  - active      : permission accordée, ou état indéterminé / erreur transitoire.
//  - denied      : l'utilisateur ou l'OS a explicitement refusé la permission.
//  - inactive    : service de localisation coupé sur l'appareil (alors qu'une
//                  autorisation avait été donnée), position indisponible.
//  - unsupported : aucune API Geolocation.
export async function probeLocationStatus(nav = getNavigator(), { timeout = 10000, maximumAge = 600000 } = {}) {
  if (!nav?.geolocation) return "unsupported";

  // 1) API Permissions : seul un « denied » explicite bloque.
  let permission = null;
  if (nav.permissions?.query) {
    try {
      permission = (await nav.permissions.query({ name: "geolocation" })).state;
    } catch {
      permission = null;
    }
  }
  if (permission === "denied") {
    rememberLocationGranted(false);
    return "denied";
  }
  if (permission === "granted") {
    // Permission accordée : on n'attend pas de position (le GPS peut être
    // lent), l'application s'ouvre immédiatement.
    rememberLocationGranted(true);
    return "active";
  }

  // 2) « prompt » / inconnu : une vraie position tranche.
  return checkPosition(nav, { timeout, maximumAge });
}

function checkPosition(nav, { timeout, maximumAge }) {
  return new Promise((resolve) => {
    nav.geolocation.getCurrentPosition(
      () => {
        rememberLocationGranted(true);
        resolve("active");
      },
      (error) => {
        // 1 = refus explicite de l'utilisateur / de l'OS.
        if (error?.code === 1) {
          rememberLocationGranted(false);
          resolve("denied");
          return;
        }
        // 3 = délai dépassé : le GPS est lent (intérieur, démarrage à froid),
        // ce n'est PAS une localisation désactivée → on laisse passer.
        // 2 = position indisponible : ambigu. On ne bloque que si aucune
        // autorisation n'a jamais été constatée.
        if (error?.code === 2 && !wasLocationGranted()) {
          resolve("inactive");
          return;
        }
        resolve("active");
      },
      { enableHighAccuracy: false, timeout, maximumAge }
    );
  });
}

// S'abonne aux changements de permission "geolocation" (API Permissions),
// quand le navigateur le permet. Renvoie une fonction de désabonnement.
export function subscribeToGeolocationPermission(onChange, nav = getNavigator()) {
  if (!nav?.permissions?.query) return () => {};
  let status;
  let cancelled = false;
  nav.permissions
    .query({ name: "geolocation" })
    .then((result) => {
      if (cancelled) return;
      status = result;
      status.onchange = () => onChange(status.state);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    if (status) status.onchange = null;
  };
}