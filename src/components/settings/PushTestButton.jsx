import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { PUSH_TEST_TARGET } from "@/lib/pushForeground";

export default function PushTestButton({ channel, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const sendTest = async () => {
    setBusy(true);
    setResult("");
    setError("");
    try {
      const response = await base44.functions.invoke("sendFcmPush", {
        test: true,
        title: "Test de notification Chay",
        body: "Les notifications push fonctionnent sur cet appareil.",
        // « test » : reçu app ouverte, l'APK affiche un bandeau (Android n'affiche rien au premier plan).
        target_type: PUSH_TEST_TARGET,
      });
      const data = response?.data || response;
      if (data?.error) throw new Error(data.error);

      if (channel === "browser") {
        if (data?.webPush?.sent) {
          setResult(`Le serveur a accepté l'envoi vers ${data.webPush.sent} abonnement(s) navigateur.`);
          if (data.webPush.failed) setError(`${data.webPush.failed} envoi(s) navigateur ont échoué.`);
        } else if (data?.webPush?.skipped) {
          setError(`Push navigateur indisponible : ${data.webPush.skipped}.`);
        } else if (!data?.webPush?.subscriptions) {
          setError("Aucun abonnement navigateur actif n'est enregistré pour ce compte.");
        } else {
          setError("Aucun envoi navigateur confirmé. Consultez les journaux du serveur.");
        }
      } else {
        if (data?.fcmError) {
          setError(`Android : ${data.fcmError}`);
        } else if (!data?.tokensFound) {
          setError("Aucun appareil Android n'est enregistré pour ce compte.");
        } else if (data?.sent) {
          setResult(
            `Firebase a accepté l'envoi vers ${data.sent} appareil(s) Android. App ouverte, Android n'affiche pas de notification système : ` +
            "un bandeau « Notification de test reçue » doit apparaître dans quelques secondes. S'il n'apparaît pas, ce téléphone n'a pas reçu le push.",
          );
          if (data.failed) setError(`${data.failed} envoi(s) Android ont échoué.`);
        } else {
          setError("Firebase n'a confirmé aucun envoi. Consultez les journaux du serveur.");
        }
      }
    } catch (cause) {
      setError(cause?.message || String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={sendTest}
        disabled={busy || disabled}
        className="h-8 px-3 rounded-lg text-xs font-semibold border border-border bg-card disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin inline-block" />}
        Tester le push {channel === "browser" ? "navigateur" : "Android"}
      </button>
      {result && <p role="status" className="mt-1 text-xs text-emerald-600">{result}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-destructive break-words">{error}</p>}
    </div>
  );
}
