// Mise en place automatique du fonctionnement hors ligne de la Bible.
//
// Aucune action de l'utilisateur n'est nécessaire : au premier lancement avec
// connexion, l'application charge (en tâche de fond, sans bloquer l'interface)
// les deux textes bibliques et les deux index de concordance, qui sont alors
// persistés sur l'appareil par `localBible` / `bibleConcordance`
// (Cache Storage puis IndexedDB) et par le service worker (public/sw.js).
// Aux lancements suivants les données sont relues localement : plus aucun
// téléchargement ni traitement coûteux.

import { loadLocalBibleRaw } from "./localBible.js";
import { loadConcordance } from "./bibleConcordance.js";
import { openDictionary } from "./dictionaryDb.js";
import { Capacitor } from "@capacitor/core";

const LANGS = ["fr", "mg"];
let started = false;

// Enregistre le service worker qui précharge les fichiers de données.
function registerOfflineWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // Dans l'APK, tous les fichiers sont déjà embarqués : pas de service worker
  // (il tentait d'abord le réseau pour la page, ce qui ralentit/bloque le
  // démarrage hors ligne).
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }
  if (!navigator.onLine) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}

function whenIdle(fn) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(fn, { timeout: 4000 });
  } else {
    setTimeout(fn, 1500);
  }
}

// Idempotent : peut être appelé plusieurs fois sans effet supplémentaire.
export function startBibleOfflineSetup() {
  if (started || typeof window === "undefined") return;
  started = true;
  registerOfflineWorker();
  whenIdle(async () => {
    for (const lang of LANGS) {
      // Séquentiel pour ne pas saturer le fil principal ni le réseau.
      await loadLocalBibleRaw(lang).catch(() => {});
      await loadConcordance(lang).catch(() => {});
    }
    // Dictionnaire Westphal : téléchargé une fois puis conservé sur l'appareil.
    await openDictionary().catch(() => {});
  });
}