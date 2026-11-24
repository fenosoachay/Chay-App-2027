// Avant le premier rendu (chargé en <head> par index.html, sans attendre) : thème et taille de police.
// Fichier séparé et non script dans la page : la protection CSP de membres.chay.fr interdit les scripts écrits
// dans la page (seuls les fichiers du site sont autorisés).
// Anti-flash : applique le thème AVANT le premier rendu React.
//
// Règle : la préférence enregistrée ("chay-theme") est prioritaire ;
// sans préférence (nouvelle installation), le mode SOMBRE est le défaut.
// Ce script est en LECTURE SEULE — il n'écrase jamais la préférence.
(function () {
  var KEY = "chay-theme"; // doit rester synchronisé avec src/lib/theme.js
  var theme = null;
  try {
    theme = localStorage.getItem(KEY);
  } catch (e) {}
  if (theme !== "light" && theme !== "dark" && theme !== "auto") {
    theme = "dark"; // aucune préférence / valeur invalide => défaut sombre
  }
  var dark =
    theme === "dark" ||
    (theme === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
// Taille de police réglée sur cet appareil (src/lib/taillePolice.js), avant le premier rendu.
(function () {
  try {
    var t = Number(localStorage.getItem("chay-taille-police"));
    if (!(t > 100)) return;
    t = t >= 150 ? 150 : Math.round(t / 5) * 5;
    var h = document.documentElement;
    h.style.fontSize = "calc(var(--chay-base, 16px) * " + t / 100 + ")";
    h.style.setProperty("--chay-zoom", String(t / 100));
    h.setAttribute("data-police", String(t));
    if (t >= 150) h.setAttribute("data-police-grande", "");
  } catch (e) {}
})();
