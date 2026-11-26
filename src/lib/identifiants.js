// 1.4.0 : connexion en un toucher (ChayIdentifiantsPlugin.java, Gestionnaire d'identifiants d'Android).
// L'e-mail et le mot de passe sont gardés chez Google, pas dans l'appli : après « Effacer le stockage »,
// une réinstallation ou un nouveau téléphone, Android les propose au lieu de tout faire retaper.
import { Capacitor, registerPlugin } from "@capacitor/core";

const ChayIdentifiants = registerPlugin("ChayIdentifiants");

export function identifiantsDisponibles() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** Fenêtre d'Android avec les comptes enregistrés. Renvoie { email, motDePasse } ou null. */
export async function proposerIdentifiants() {
  if (!identifiantsDisponibles()) return null;
  try {
    const r = await ChayIdentifiants.recuperer();
    if (!r?.trouve || !r.identifiant || !r.motDePasse) return null;
    return { email: String(r.identifiant), motDePasse: String(r.motDePasse) };
  } catch {
    return null;
  }
}

/** Après une connexion réussie : Android propose « Enregistrer le mot de passe ? » (sans effet s'il l'est déjà). */
export async function enregistrerIdentifiants(email, motDePasse) {
  if (!identifiantsDisponibles() || !email || !motDePasse) return false;
  try {
    const r = await ChayIdentifiants.enregistrer({ identifiant: email, motDePasse });
    return Boolean(r?.enregistre);
  } catch {
    return false;
  }
}
