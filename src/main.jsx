import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'

// Message discret si l'application ne peut pas démarrer (jamais d'écran de diagnostic).
function showStartupError() {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML =
    '<div style="position:fixed;left:0;right:0;bottom:0;padding:12px 16px;text-align:center;font:600 14px Gilroy,sans-serif;color:#fff;background:#ff5a3d">' +
    'Erreur de chargement. Veuillez redémarrer l\u2019application.</div>';
}

async function initialize() {
  try {
    const { default: App } = await import('@/App.jsx');
    const root = document.getElementById('root');
    if (!root) throw new Error('RootElementNotFound: élément #root absent');
    ReactDOM.createRoot(root).render(<App />);
    const { startBibleOfflineSetup } = await import('@/lib/bibleOfflineBootstrap');
    startBibleOfflineSetup();
  } catch (error) {
    console.error('Démarrage impossible :', error);
    showStartupError();
  }
}
initialize();