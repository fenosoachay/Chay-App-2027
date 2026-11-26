// 1.4.0 : mise à jour obligatoire de l'application Android. Dès qu'une version plus récente est publiée
// (latest.json), l'appli est bloquée derrière un écran « Mise à jour disponible » tant qu'elle n'est pas
// installée. Calculs seuls ici (testés sans téléphone) ; l'écran est src/components/MiseAJourObligatoire.jsx.

/** Version d'Android du téléphone d'après le navigateur intégré (« Android 13 » -> 13), ou null. */
export function versionAndroid(userAgent) {
  const m = /Android\s+(\d+)/i.exec(String(userAgent || ""));
  return m ? Number(m[1]) : null;
}

/**
 * Faut-il bloquer l'appli ? Oui seulement si :
 *  - la dernière version publiée est connue (latest.json lu ; hors connexion on ne bloque jamais),
 *  - le numéro de version installé est connu et plus ancien,
 *  - le téléphone peut installer la nouvelle version (latest.androidMin, facultatif : sinon on ne bloque pas
 *    un téléphone trop ancien, qui ne pourrait jamais se mettre à jour).
 */
export function doitBloquer(latest, installe, android = null) {
  if (!latest || !Number.isSafeInteger(latest.versionCode)) return false;
  const build = Number(installe?.build);
  if (!Number.isSafeInteger(build) || build < 1) return false;
  if (build >= latest.versionCode) return false;
  const min = Number(latest.androidMin);
  if (Number.isFinite(min) && min > 0 && Number.isFinite(android) && android < min) return false;
  return true;
}

/** Délai minimal entre deux vérifications au retour dans l'appli. */
export const INTERVALLE_VERIFICATION_MS = 10 * 60 * 1000;
