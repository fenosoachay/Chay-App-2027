import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, BellRing, Smartphone, X, Check, AlertTriangle } from "lucide-react";

export default function PublishContent() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke("sendTestNotification", {});
      setTestResult((res && (res.data || res)) || {});
    } catch (e) {
      setTestResult({ error: (e && e.message) || String(e) });
    }
    setTesting(false);
  };

  const runPushTest = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await base44.functions.invoke("sendFcmPush", { test: true });
      setPushResult((res && (res.data || res)) || {});
    } catch (e) {
      setPushResult({ error: (e && e.message) || String(e) });
    }
    setPushing(false);
  };

  return (
    <div className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6 space-y-6">
      {/* Test notifications in-app */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BellRing className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-base">Test du système de notifications</h3>
        </div>
        <p className="text-xs text-foreground/55 mb-3">
          Envoie une notification de test à vous-même (in-app + e-mail) et affiche le résultat détaillé.
        </p>
        <Button variant="outline" onClick={runTest} disabled={testing} className="w-full">
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellRing className="h-4 w-4 mr-2" />}
          Envoyer une notification de test à moi-même
        </Button>
      </div>

      {/* Test push Android */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-base">Test du push natif (Android)</h3>
        </div>
        <p className="text-xs text-foreground/55 mb-3">
          Envoie un push de test à votre téléphone (uniquement si l'app mobile est installée et enregistrée).
          Affiche le nombre de tokens trouvés et la réponse brute de Firebase.
        </p>
        <Button variant="outline" onClick={runPushTest} disabled={pushing} className="w-full">
          {pushing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
          Envoyer un push de test à mon téléphone
        </Button>
      </div>

      {/* Résultat test notif */}
      <Dialog open={!!testResult} onOpenChange={(v) => !v && setTestResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Résultat du test</DialogTitle>
            <DialogDescription>Détail de la notification et de l'e-mail de test.</DialogDescription>
          </DialogHeader>
          {testResult?.error ? (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{testResult.error}</span>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                {testResult?.notification?.created ? (
                  <Check className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                )}
                <div>
                  <div className="font-bold">Notification in-app</div>
                  <div className="text-foreground/60 text-xs">
                    {testResult?.notification?.created
                      ? `Créée (id : ${testResult?.notification?.id || "—"})`
                      : `Échec : ${testResult?.notification?.error || "erreur inconnue"}`}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                {testResult?.email?.sent ? (
                  <Check className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                ) : (
                  <X className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                )}
                <div>
                  <div className="font-bold">E-mail</div>
                  <div className="text-foreground/60 text-xs">
                    {testResult?.email?.sent
                      ? `Envoyé à ${testResult?.email?.to || "—"}`
                      : `Non envoyé : ${testResult?.email?.error || "aucune adresse ou erreur"}`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Résultat test push */}
      <Dialog open={!!pushResult} onOpenChange={(v) => !v && setPushResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Résultat du push de test</DialogTitle>
            <DialogDescription>Détail de l'envoi push : navigateur et Android.</DialogDescription>
          </DialogHeader>
          {pushResult?.error ? (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{pushResult.error}</span>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {pushResult?.webPush?.skipped || !(pushResult?.webPush?.subscriptions > 0) ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
                <span className="font-bold">
                  Navigateur — abonnements : {pushResult?.webPush?.subscriptions ?? 0}
                  {" "}· Envoyés : {pushResult?.webPush?.sent ?? 0}
                  {" "}· Échecs : {pushResult?.webPush?.failed ?? 0}
                  {pushResult?.webPush?.skipped ? ` · non exécuté (${pushResult.webPush.skipped})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {pushResult?.sent > 0 ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <X className="h-4 w-4 text-destructive" />
                )}
                <span className="font-bold">Tokens Android trouvés : {pushResult?.tokensFound ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Envoyés : {pushResult?.sent ?? 0} · Échecs : {pushResult?.failed ?? 0}</span>
              </div>
              <div>
                <div className="font-bold mb-1">Réponse Firebase :</div>
                <pre className="text-xs bg-muted rounded-xl p-2 overflow-auto max-h-40">{JSON.stringify(pushResult?.firebaseResponses || [], null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
