// Ouvre un lien externe directement : la confirmation éventuelle est celle du
// système (Android), sans dialogue supplémentaire de l'application.
export function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}