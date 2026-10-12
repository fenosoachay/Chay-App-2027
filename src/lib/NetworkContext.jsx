import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { flushQueue } from "@/lib/offlineSync";
import { queueSize } from "@/lib/offlineQueue";

const NetworkContext = createContext({ isOnline: true, recheck: async () => true });

export function NetworkProvider({ children }) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const wasOffline = useRef(false);

  const handleOnline = useCallback(async () => {
    setIsOnline(true);
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const hadPending = queueSize() > 0;
    await flushQueue();
    toast({
      title: "Connexion rétablie",
      description: hadPending ? "Synchronisation terminée." : undefined,
    });
  }, [toast]);

  const handleOffline = useCallback(() => {
    wasOffline.current = true;
    setIsOnline(false);
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (!navigator.onLine) wasOffline.current = true;
    else flushQueue();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // Bouton « Réessayer » : relit l'état réseau du navigateur.
  const recheck = useCallback(async () => {
    const ok = navigator.onLine;
    if (ok) await handleOnline();
    else setIsOnline(false);
    return ok;
  }, [handleOnline]);

  return <NetworkContext.Provider value={{ isOnline, recheck }}>{children}</NetworkContext.Provider>;
}

export const useNetwork = () => useContext(NetworkContext);