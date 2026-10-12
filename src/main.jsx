import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/index.css'
import { installStartupGuard, showStartupError } from '@/lib/startupGuard'

// Garde-fou : un échec de chargement affiche un message local, pas un écran blanc.
installStartupGuard()

async function initialize() {
  try {
    window.__chayStartup?.log('INITIALISATION', 'Chargement du composant racine');
    const { default: App } = await import('@/App.jsx');
    const root = document.getElementById('root');
    if (!root) throw new Error('RootElementNotFound: élément #root absent');
    ReactDOM.createRoot(root).render(<App />);
    window.__chayStartup?.log('INITIALISATION', 'Rendu React demandé');
    const { startBibleOfflineSetup } = await import('@/lib/bibleOfflineBootstrap');
    startBibleOfflineSetup();
  } catch (error) {
    console.error('Démarrage impossible :', error);
    showStartupError(error);
  }
}
initialize();