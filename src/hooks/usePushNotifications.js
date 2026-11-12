import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { base44 } from "@/api/base44Client";
import { backendText } from "@/api/backendConfig";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { usePreferences } from "@/lib/PreferencesContext";
import { deactivateDeviceToken, upsertDeviceToken } from "@/lib/deviceTokenSync";
import { ouvrirNotification } from "@/lib/ouvrirNotification";
import { foregroundPushToast } from "@/lib/pushForeground";
import { traiterReponseRapide } from "@/lib/reponseRapide";
import { enqueue } from "@/lib/offlineQueue";
import { ChayConversation } from "@/lib/chayConversation";

const CHANNEL_ID = "chay-default";
const CHANNEL_NAME = "Chay";

// Émet un évènement global lu par la carte de statut push (Réglages).
function emitStatus(detail) {
  try {
    window.chayPushStatus = detail;
    window.dispatchEvent(new CustomEvent("chay-push-status", { detail }));
  } catch {
    /* ignore */
  }
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Empêche deux appels concurrents (même onglet/process) d'enregistrer le même
// token en double : tant qu'un upsert est en cours pour ce token, les appels
// suivants attendent son résultat au lieu de relancer un filter()+create().
const upsertInFlight = new Map();

async function upsertToken(token, platform, userId) {
  if (!userId) {
    throw new Error("Utilisateur non connecté : impossible d'enregistrer le token.");
  }
  const key = token;
  if (upsertInFlight.has(key)) {
    return upsertInFlight.get(key);
  }
  // Mise à jour sans user_id (interdit par la règle PocketBase) ; ligne recréée si la mise à jour répond 404.
  const promise = upsertDeviceToken(base44.entities, { token, platform, userId }).finally(() => {
    upsertInFlight.delete(key);
  });
  upsertInFlight.set(key, promise);
  return promise;
}

const deactivateToken = (token) => deactivateDeviceToken(base44.entities, token);

// Enregistre le token FCM de l'appareil (uniquement sur build natif Android).
// Au premier lancement, affiche un court message FR puis demande l'autorisation.
export function usePushNotifications(navigate) {
  const { user, isAuthenticated } = useAuth();
  const { prefs } = usePreferences();
  const { toast } = useToast();
  const tokenRef = useRef(null);
  const pushEnabled =
    prefs.notifications_enabled !== false && prefs.notif_push !== false;

  useEffect(() => {
    if (!isNative() || !isAuthenticated || !user?.id) return;
    if (!pushEnabled) {
      if (tokenRef.current) deactivateToken(tokenRef.current);
      emitStatus({ disabled: true });
      return;
    }
    let handles = [];
    let active = true;
    let settled = false;

    const start = async () => {
      try {
        let perm = await PushNotifications.checkPermissions();
        if (
          perm.receive === "prompt" ||
          perm.receive === "prompt-with-rationale"
        ) {
          toast({
            title: "Autorisation des notifications",
            description:
              "Nous vous prévenons des nouveaux messages et nouveautés, même quand l'app est fermée.",
          });
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") {
          emitStatus({ error: "Permission de notifications refusée." });
          return;
        }

        try {
          await PushNotifications.createChannel({
            id: CHANNEL_ID,
            name: CHANNEL_NAME,
            description: "Messages et nouveautés",
            importance: 4, // Haute
            visibility: 1, // Public
            vibration: true,
          });
        } catch {
          /* iOS / web : pas de canal */
        }

        handles.push(
          await PushNotifications.addListener("registration", async (ev) => {
            settled = true;
            tokenRef.current = ev.value;
            try {
              await upsertToken(
                ev.value,
                Capacitor.getPlatform() === "ios" ? "ios" : "android",
                user?.id
              );
              emitStatus({ ok: true, token: ev.value });
            } catch (e) {
              emitStatus({
                error: "Échec enregistrement token : " + (e?.message || JSON.stringify(e)),
              });
            }
          })
        );
        handles.push(
          await PushNotifications.addListener("registrationError", (err) => {
            settled = true;
            emitStatus({
              error:
                "Erreur d'enregistrement push (FCM) : " +
                (err?.error || err?.message || JSON.stringify(err)),
            });
          })
        );
        handles.push(
          await PushNotifications.addListener("pushNotificationReceived", (notification) => {
            // App ouverte : Android n'affiche pas de notification système au premier plan.
            // Messages et contenus : le bandeau in-app vient de la UserNotification temps réel (pas de
            // doublon). Push de TEST : bandeau ici, preuve que ce téléphone a bien reçu le push.
            const bandeau = foregroundPushToast(notification);
            if (bandeau) toast(bandeau);
          })
        );
        handles.push(
          await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            // App ouverte ou fermée (Capacitor garde le clic jusqu'à ce listener) : écran précis du contenu.
            ouvrirNotification(action?.notification?.data || {}, navigate);
          })
        );
        handles.push(
          await ChayConversation.addListener("reponse", (data) => {
            // Réponse rapide saisie dans la notification (ou la bulle) d'un message privé.
            traiterReponseRapide({
              invoke: (name, body) => base44.functions.invoke(name, body),
              updateConversation: (id, patch) => base44.entities.Conversation.update(id, patch),
              enqueue,
              effacer: (conversation) => ChayConversation.effacer({ conversation }),
              navigate,
              toast,
            }, data);
          })
        );

        await PushNotifications.register();
        // Si FCM n'est pas initialisé côté natif (build sans google-services),
        // aucun évènement registration/registrationError ne se déclenche.
        setTimeout(() => {
          if (!settled && active) {
            emitStatus({
              error: backendText(
                "Aucun token FCM reçu après 10 s. Le build Android n'inclut probablement pas google-services : régénérez l'AAB via Publish → Mobile app → Create Google Play files avec « Add push notifications » activé et google-services.json uploadé.",
                "Aucun token FCM reçu après 10 s. Le build Android n'inclut probablement pas google-services : reconstruisez l'APK avec android/app/google-services.json du projet Firebase (le même que FIREBASE_SERVICE_ACCOUNT).",
              ),
            });
          }
        }, 10000);
      } catch (e) {
        if (active) emitStatus({ error: "register() a échoué : " + (e?.message || String(e)) });
      }
    };
    start();

    return () => {
      active = false;
      handles.forEach((h) => h && typeof h.remove === "function" && h.remove());
      handles = [];
    };
  }, [isAuthenticated, pushEnabled, user?.id]);

  // Déconnexion : désactiver le token de cet appareil.
  useEffect(() => {
    if (!isNative()) return;
    if (!isAuthenticated && tokenRef.current) {
      deactivateToken(tokenRef.current);
      tokenRef.current = null;
    }
  }, [isAuthenticated]);
}