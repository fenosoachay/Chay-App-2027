// Garde-fou de démarrage : si l'application ne parvient pas à s'afficher
// (erreur de chargement d'un module, échec réseau non géré), on affiche un
// message local avec un bouton « Réessayer » au lieu d'un écran blanc.
// Écrit en JS/DOM pur : il doit fonctionner même si React n'a pas démarré.

let shown = false;

export function showStartupError(message) {
  if (shown) return;
  const root = document.getElementById("root");
  // Si React a déjà rendu quelque chose, on ne le remplace pas.
  if (!root || root.childElementCount > 0) return;
  shown = true;
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:grid;place-items:center;background:#000;color:#fff;font-family:system-ui,sans-serif;padding:24px;text-align:center">
      <div style="max-width:320px">
        <p style="font-size:18px;font-weight:700;margin:0 0 8px">Chargement impossible</p>
        <p style="font-size:14px;opacity:.8;margin:0 0 20px">${message}</p>
        <button id="chay-retry" style="background:#fff;color:#000;border:0;border-radius:999px;padding:10px 22px;font-weight:700;font-size:14px">Réessayer</button>
      </div>
    </div>`;
  document.getElementById("chay-retry")?.addEventListener("click", () => window.location.reload());
}

export function installStartupGuard() {
  const offline = () => typeof navigator !== "undefined" && !navigator.onLine;
  const msg = () =>
    offline()
      ? "Vous êtes hors ligne. Réessayez dans un instant."
      : "L'application n'a pas pu démarrer. Vérifiez votre connexion puis réessayez.";

  // Les échecs de fetch / promesses non gérées ne plantent plus en silence.
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Promesse rejetée non gérée :", e.reason);
    // On empêche l'erreur de remonter ; l'écran n'est remplacé que s'il est vide.
    e.preventDefault();
    setTimeout(() => showStartupError(msg()), 0);
  });
  window.addEventListener("error", (e) => {
    console.error("Erreur au démarrage :", e.error || e.message);
    setTimeout(() => showStartupError(msg()), 0);
  });
}