import React, { useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useNetwork } from "@/lib/NetworkContext";

// Message doux pour les fonctionnalités qui exigent internet.
export default function OfflineNotice() {
  const { recheck } = useNetwork();
  const [checking, setChecking] = useState(false);
  const retry = async () => {
    setChecking(true);
    await recheck();
    setChecking(false);
  };
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-orange-500/15 text-orange-500">
        <WifiOff className="h-6 w-6" />
      </div>
      <p className="text-muted-foreground">
        Vous êtes hors ligne. Cette fonctionnalité sera disponible dès que la connexion sera rétablie.
      </p>
      <button
        onClick={retry}
        disabled={checking}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
        Réessayer
      </button>
    </div>
  );
}