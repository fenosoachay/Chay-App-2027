import React from "react";
import { WifiOff } from "lucide-react";
import { useNetwork } from "@/lib/NetworkContext";

// Bandeau discret affiché en haut de tous les écrans quand l'appareil est hors ligne.
export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  if (isOnline) return null;
  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-orange-500 text-white text-xs font-semibold py-1.5"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-3.5 w-3.5" />
      Mode hors ligne
    </div>
  );
}