import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { startBibleOfflineSetup } from '@/lib/bibleOfflineBootstrap'
import { installStartupGuard, showStartupError } from '@/lib/startupGuard'

// Garde-fou : un échec de chargement affiche un message local, pas un écran blanc.
installStartupGuard()

// Prépare en tâche de fond le fonctionnement hors ligne de la Bible (textes FR
// et MG, index de concordance, service worker) : aucune action requise.
// Ne doit jamais empêcher l'application de démarrer.
try {
  startBibleOfflineSetup()
} catch (e) {
  console.error('Préparation hors ligne impossible :', e)
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
} catch (e) {
  console.error('Démarrage impossible :', e)
  showStartupError("L'application n'a pas pu démarrer. Réessayez.")
}