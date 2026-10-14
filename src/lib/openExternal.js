import { confirmFr } from "@/lib/confirmFr";

// Nom lisible du site (ex. « www.facebook.com ») pour la confirmation.
function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}

// Ouvre un lien externe après une confirmation en français.
// (Le dialogue natif « Open External Link? » suit la langue du téléphone : on
// affiche la nôtre, puis on ouvre le lien dans le navigateur.)
export async function openExternal(url) {
  const ok = await confirmFr({
    title: "Ouvrir le lien externe ?",
    message: `Voulez-vous ouvrir ${hostOf(url)} dans votre navigateur ?`,
    confirmLabel: "Ouvrir",
    cancelLabel: "Annuler",
  });
  if (!ok) return;
  window.open(url, "_blank", "noopener,noreferrer");
}