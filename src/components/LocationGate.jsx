import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, MapPinOff, RefreshCw } from "lucide-react";
import { probeLocationStatus, subscribeToGeolocationPermission } from "@/lib/locationGate";

const RECHECK_INTERVAL_MS = 6000;

// Bloque l'accès à l'application uniquement quand la localisation est
// réellement coupée ou refusée. Le statut de départ est « active » : l'app ne
// se ferme jamais le temps d'une vérification, et il faut deux sondes
// négatives consécutives pour afficher l'écran de blocage (évite les faux
// positifs d'un GPS lent ou d'une sonde isolée).
export default function LocationGate({ children }) {
  const [status, setStatus] = useState("active"); // active | denied | inactive | unsupported
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(null);
  const negativesRef = useRef(0);

  const check = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    const result = await probeLocationStatus();
    if (result === "active") {
      negativesRef.current = 0;
      setStatus("active");
    } else {
      negativesRef.current += 1;
      // Refus explicite ou manque de support : certain, on bloque tout de suite.
      // Position indisponible : on exige une seconde confirmation (ou un clic manuel).
      if (result === "denied" || result === "unsupported" || manual || negativesRef.current >= 2) {
        setStatus(result);
      }
    }
    if (manual) setChecking(false);
    return result;
  }, []);

  useEffect(() => {
    check();
    const unsubscribe = subscribeToGeolocationPermission((state) => {
      if (state === "granted") {
        negativesRef.current = 0;
        setStatus("active");
      } else if (state === "denied") {
        setStatus("denied");
      }
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Re-sonde tant que l'accès est bloqué, pour reprendre dès que la
  // localisation est réactivée.
  useEffect(() => {
    if (status === "active") return undefined;
    timerRef.current = setInterval(() => check(), RECHECK_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [status, check]);

  if (status === "active") return children;

  const messages = {
    denied: "L'accès à la localisation a été refusé. Autorisez-la dans les réglages de votre appareil ou de votre navigateur pour continuer.",
    inactive: "Le service de localisation est désactivé. Activez-le dans les réglages de votre appareil pour continuer.",
    unsupported: "Votre appareil ou navigateur ne prend pas en charge la localisation, requise pour utiliser l'application.",
  };

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <MapPinOff className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-lg font-bold text-foreground">Localisation requise</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{messages[status] || messages.inactive}</p>
      <button
        onClick={() => check(true)}
        disabled={checking}
        className="inline-flex items-center gap-2 rounded-2xl brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /> Réessayer
      </button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <MapPin className="h-3.5 w-3.5" /> Disponible en ligne comme hors connexion
      </p>
    </div>
  );
}