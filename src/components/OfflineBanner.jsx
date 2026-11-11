import React from "react";
import { WifiOff } from "lucide-react";
import { useNetwork } from "@/lib/NetworkContext";

// Hors ligne avec une session connue : l'app reste complète (pas de déconnexion) ; ce bandeau discret
// signale seulement la coupure. La session est revérifiée automatiquement au retour du réseau.
export const TEXTE_HORS_LIGNE = "Hors ligne : dernières données affichées. Reconnexion automatique.";

export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  if (isOnline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      {TEXTE_HORS_LIGNE}
    </div>
  );
}
