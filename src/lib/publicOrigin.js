import { Capacitor } from "@capacitor/core";

// Adresse publique de l'application. Dans l'APK l'interface tourne sur
// https://localhost : les liens partagés doivent pointer vers le site publié.
export const PUBLIC_APP_URL = "https://chay.base44.app";

export function getPublicOrigin() {
  return Capacitor.isNativePlatform() ? PUBLIC_APP_URL : window.location.origin;
}