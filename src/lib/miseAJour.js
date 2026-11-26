// Mise à jour de l'application Android DEPUIS l'application (plugin natif ChayMiseAJour, déclaré dans
// chayConversation.js ; android/…/ChayMiseAJourPlugin.java) : téléchargement avec barre de progression, puis
// fenêtre d'installation d'Android. Plus de navigateur ni de fichier à ouvrir. Utilisé par « À propos » (où mène
// la notification « Nouvelle version »). Ce fichier ne contient que des calculs (testés sans téléphone).

/** « 12,3 Mo sur 24,0 Mo » (ou « 12,3 Mo » si la taille totale est inconnue). */
export function texteProgression(recus, total, locale = "fr-FR") {
  // 1.3.40 : mégaoctets « décimaux » (1 Mo = 1 000 000 octets), comme le gestionnaire de fichiers d'Android.
  const mo = (n) => `${(Math.max(0, Number(n) || 0) / 1e6).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
  return Number(total) > 0 ? `${mo(recus)} sur ${mo(total)}` : mo(recus);
}

/** Pourcentage borné 0..100 (null si inconnu). */
export function pourcentage(recus, total) {
  const r = Number(recus);
  const t = Number(total);
  if (!(t > 0) || !Number.isFinite(r)) return null;
  return Math.max(0, Math.min(100, Math.floor((r * 100) / t)));
}
