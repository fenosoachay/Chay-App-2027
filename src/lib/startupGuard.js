// Garde-fou de démarrage : si l'application ne parvient pas à s'afficher
// (erreur de chargement d'un module, échec réseau non géré), on affiche un
// message local avec un bouton « Réessayer » au lieu d'un écran blanc.
// Écrit en JS/DOM pur : il doit fonctionner même si React n'a pas démarré.

let installed = false;

export function showStartupError(error) {
  if (window.__chayStartup) { window.__chayStartup.fail(error); return; }
  const screen = document.createElement('pre');
  screen.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#9b111e;color:white;padding:24px;white-space:pre-wrap;overflow:auto;user-select:text;';
  screen.textContent = String(error) + '\n' + (error?.stack || '');
  document.body.appendChild(screen);
}

export function installStartupGuard() {
  if (installed || window.__chayStartup) return;
  installed = true;
  window.addEventListener('error', event => showStartupError(event.error || event.message));
  window.addEventListener('unhandledrejection', event => showStartupError(event.reason));
}