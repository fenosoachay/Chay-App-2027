import { Browser } from "@capacitor/browser";
import { confirmFr } from "@/lib/confirmFr";

// Demande une confirmation en français avant d'ouvrir le lien.
export async function openExternal(url) {
  const confirmed = await confirmFr({
    title: "Ouvrir le lien externe ?",
    message: "Voulez-vous ouvrir ce lien dans votre navigateur ?",
    confirmLabel: "Ouvrir",
    cancelLabel: "Annuler",
  });

  if (!confirmed) return;

  await Browser.open({ url });
}