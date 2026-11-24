import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'
import { installerAttenteMedia } from '@/lib/attenteMedia'

// Image d'attente Chay sur les photos et vidéos qui chargent (1.3.25).
installerAttenteMedia()

// Message discret si l'application ne peut pas démarrer (jamais d'écran de diagnostic).
function showStartupError() {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML =
    '<div style="position:fixed;left:0;right:0;bottom:0;padding:12px 16px;text-align:center;font:600 14px Gilroy,sans-serif;color:#fff;background:#ff5a3d">' +
    'Erreur de chargement. Veuillez redémarrer l\u2019application.</div>';
}

/* Un module chargé à la demande (mise en page locale, pages…) peut échouer une
   fois à se charger après une mise à jour de l'application : le navigateur
   garde alors une ancienne référence et l'écran devient vide. On recharge une
   seule fois la page pour récupérer la version à jour, au lieu d'afficher une
   erreur. Le témoin évite toute boucle de rechargement. */
const RELOAD_KEY = 'chay_module_reload';

function isModuleLoadError(reason) {
  const message = typeof reason === 'string' ? reason : reason?.message || '';
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

function recoverFromModuleError(event) {
  if (sessionStorage.getItem(RELOAD_KEY) === '1') return;
  sessionStorage.setItem(RELOAD_KEY, '1');
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  window.location.reload();
}

window.addEventListener('vite:preloadError', recoverFromModuleError);
window.addEventListener('unhandledrejection', (event) => {
  if (isModuleLoadError(event.reason)) recoverFromModuleError(event);
});

async function initialize() {
  try {
    const { default: App } = await import('@/App.jsx');
    const root = document.getElementById('root');
    if (!root) throw new Error('RootElementNotFound: élément #root absent');
    ReactDOM.createRoot(root).render(<App />);
    // Démarrage réussi : la prochaine mise à jour pourra de nouveau recharger.
    sessionStorage.removeItem(RELOAD_KEY);
    const { startBibleOfflineSetup } = await import('@/lib/bibleOfflineBootstrap');
    startBibleOfflineSetup();
  } catch (error) {
    console.error('Démarrage impossible :', error);
    showStartupError();
  }
}
initialize();