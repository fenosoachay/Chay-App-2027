import React from "react";
import { useNetwork } from "@/lib/NetworkContext";
import OfflineNotice from "@/components/OfflineNotice";

// Enveloppe une page cloud : hors ligne, affiche le message doux au lieu de la page.
export default function RequiresOnline({ children }) {
  const { isOnline } = useNetwork();
  return isOnline ? children : <OfflineNotice />;
}