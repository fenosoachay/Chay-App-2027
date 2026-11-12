// Animation de départ (SplashScreen) : 4 secondes, lente ; un toucher la passe.
// Le MÊME dégradé est affiché du lancement natif Android (res/drawable/splash_gradient.xml) à index.html
// (#chay-boot-splash) puis au splash React : plus de clignotement (bleu -> noir -> dégradé).

export const SPLASH_GRADIENT = "linear-gradient(135deg, #4A6CFE 0%, #8A56E2 50%, #FF57B2 100%)";
export const SPLASH_COLORS = ["#4A6CFE", "#8A56E2", "#FF57B2"];
export const SPLASH_DURATION_MS = 4000;
export const SPLASH_EXIT_S = 0.6;

// Apparitions successives (secondes) : la dernière se termine à 3,4 s, l'écran reste 0,6 s, puis fondu.
export const SPLASH_STEPS = {
  nom: { delay: 0.3, duration: 1.0 },
  sigle: { delay: 1.0, duration: 1.0 },
  ligne: { delay: 1.8, duration: 0.8 },
  citation: { delay: 2.4, duration: 1.0 },
};

export const BOOT_SPLASH_ID = "chay-boot-splash";

/** Retire le fond de démarrage d'index.html (affiché avant le chargement du code). */
export function removeBootSplash(doc = typeof document === "undefined" ? null : document) {
  doc?.getElementById?.(BOOT_SPLASH_ID)?.remove?.();
}
