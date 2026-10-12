import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { startBibleOfflineSetup } from '@/lib/bibleOfflineBootstrap'

// Prépare en tâche de fond le fonctionnement hors ligne de la Bible (textes FR
// et MG, index de concordance, service worker) : aucune action requise.
startBibleOfflineSetup()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)