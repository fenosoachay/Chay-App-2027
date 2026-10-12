import React, { useEffect } from "react";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { APP_VERSION } from "@/lib/appVersion";
import { OFFLINE_PATTERN } from "@/lib/mediaConstants";

export default function AppLoader({ offline, retry }) {
  const { toast } = useToast();

  useEffect(() => {
    const key = "chay_last_version";
    try {
      const last = localStorage.getItem(key);
      if (last && last !== APP_VERSION) {
        toast({
          title: "Nouvelle version disponible",
          description: `L'application a été mise à jour (v${APP_VERSION}).`,
        });
      }
      localStorage.setItem(key, APP_VERSION);
    } catch {
      /* ignore */
    }
  }, [toast]);

  if (offline) {
    return (
      <div
        data-chay-loading="true"
        className="fixed inset-0 grid place-items-center bg-[#63707d]"
        style={{ backgroundImage: `url(${OFFLINE_PATTERN})`, backgroundSize: "240px" }}
      >
        <div className="mx-6 max-w-sm rounded-[1.5rem] border border-white/20 bg-black/55 backdrop-blur-md px-6 py-7 text-center text-white shadow-xl">
          <WifiOff className="h-10 w-10 mx-auto mb-3" />
          <p className="font-display font-bold text-lg">Connexion instable</p>
          <p className="mt-1 text-sm text-white/80">
            Vérifiez votre connexion Internet, puis réessayez.
          </p>
          {retry && (
            <button
              onClick={retry}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white text-foreground px-5 py-2.5 text-sm font-bold hover:scale-105 transition"
            >
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-chay-loading="true" role="status" aria-live="polite" className="fixed inset-0 grid place-items-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Chargement de l'application…</span>
    </div>
  );
}