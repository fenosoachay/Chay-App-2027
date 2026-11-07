import { Capacitor } from "@capacitor/core";
import { IS_POCKETBASE, PB_PUBLIC_APP_URL } from "@/api/backendConfig";

// Adresse publique de l'application. Dans l'APK l'interface tourne sur
// https://localhost : les liens partagés doivent pointer vers le site publié.
// Mode PocketBase : VITE_PUBLIC_APP_URL (src/api/backendConfig.js). Mode Base44 : inchangé.
export const PUBLIC_APP_URL = IS_POCKETBASE ? PB_PUBLIC_APP_URL : "https://chay.base44.app";

export function getPublicOrigin() {
  return Capacitor.isNativePlatform() ? PUBLIC_APP_URL : window.location.origin;
}