// Juste après le fond de démarrage (#chay-boot-splash) dans index.html. Fichier séparé : voir demarrage.js.
// Animation déjà vue dans cette session (rechargement) : pas de fond de démarrage.
try { if (sessionStorage.getItem("chay_splash_shown") === "1") document.getElementById("chay-boot-splash").remove(); } catch (e) { /* ignore */ }
