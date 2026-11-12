import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BellRing, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import PushTestButton from "@/components/settings/PushTestButton";

// Carte de statut des notifications push natives (Android). Affiche l'état
// (indisponible sur web, actif ou erreur sur natif) et écoute l'évènement
// "chay-push-status" émis par usePushNotifications.
export default function PushStatusCard() {
  const [status, setStatus] = useState(null);
  const [native, setNative] = useState(false);

  useEffect(() => {
    try {
      setNative(Capacitor.isNativePlatform());
    } catch {
      setNative(false);
    }
    setStatus(window.chayPushStatus || null);
    const onStatus = (e) => setStatus(e.detail || {});
    window.addEventListener("chay-push-status", onStatus);
    return () => window.removeEventListener("chay-push-status", onStatus);
  }, []);

  if (!native) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 mb-1">
        <Smartphone className="h-4 w-4 mt-0.5 text-foreground/50 shrink-0" />
        <p className="text-xs text-foreground/55">
          Push natif : réservé à l'application mobile Android. Sur ce
          navigateur, utilisez « Notifications du navigateur » ci-dessous.
        </p>
      </div>
    );
  }

  const error = status?.error;
  const ok = status?.ok;
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 mb-1 ${
        error
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/40"
      }`}
    >
      <BellRing className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold">Notifications push (Android)</p>
        {error ? (
          <p className="text-xs text-destructive flex items-start gap-1 mt-0.5 selectable">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 shrink self-start" />
            <span className="break-words">{error}</span>
          </p>
        ) : status?.disabled ? (
          <p className="text-xs text-foreground/55 mt-0.5">
            Notifications push désactivées selon vos préférences.
          </p>
        ) : ok ? (
          <div className="mt-0.5">
            <p className="text-xs text-foreground/60 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              Appareil enregistré pour les notifications.
            </p>
            {status?.token && (
              <p className="text-[0.625rem] text-foreground/40 mt-0.5 break-all selectable">
                Token : {String(status.token).slice(0, 24)}…
              </p>
            )}
            <PushTestButton channel="android" />
          </div>
        ) : (
          <p className="text-xs text-foreground/55 mt-0.5">
            Enregistrement de l'appareil en cours…
          </p>
        )}
      </div>
    </div>
  );
}