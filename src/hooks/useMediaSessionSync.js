import { useCallback, useEffect, useRef } from "react";
import { useWebMediaSession } from "@/hooks/useWebMediaSession";
import {
  checkAndroidMediaNotificationPermission,
  clearAndroidMediaNotification,
  isAndroidApp,
  openAndroidMediaNotificationSettings,
  requestAndroidMediaNotificationPermission,
  subscribeAndroidMediaActions,
  updateAndroidMediaNotification,
} from "@/lib/androidMediaNotification";
import {
  createMediaNotificationState,
  dispatchMediaNotificationAction,
  shouldShowMediaNotification,
} from "@/lib/mediaNotificationState";

/**
 * Synchronise le média actif avec les contrôles système Android/iOS.
 */
export function useMediaSessionSync(control) {
  const controlRef = useRef(control);
  const permissionResultRef = useRef(null);
  const permissionCheckRef = useRef(null);
  const permissionRequestedRef = useRef("");
  const notificationStartedRef = useRef(false);
  controlRef.current = control;

  const syncAndroidNotification = useCallback(async () => {
    let current = controlRef.current;
    if (!current) {
      clearAndroidMediaNotification().catch((error) => {
        console.error("[MediaNotification] Unable to clear native media notification.", error);
      });
      notificationStartedRef.current = false;
      return;
    }

    try {
      if (!permissionResultRef.current) {
        if (!permissionCheckRef.current) {
          permissionCheckRef.current = checkAndroidMediaNotificationPermission()
            .finally(() => { permissionCheckRef.current = null; });
        }
        permissionResultRef.current = await permissionCheckRef.current;
      }

      // Redemande l'autorisation à chaque nouveau média lancé tant qu'elle
      // manque (Android 13+ ne réaffiche la fenêtre qu'après un refus simple ;
      // sinon le message des Réglages guide l'utilisateur).
      if (!permissionResultRef.current.granted && current.isPlaying) {
        const mediaKey = String(current.id?.description || current.title || "");
        if (permissionRequestedRef.current !== mediaKey) {
          permissionRequestedRef.current = mediaKey;
          permissionResultRef.current = await requestAndroidMediaNotificationPermission();
        }
      }

      window.dispatchEvent(new CustomEvent("chay-media-notification-status", {
        detail: permissionResultRef.current,
      }));

      if (!permissionResultRef.current.granted) return;
      current = controlRef.current;
      if (!current) return;
      if (!shouldShowMediaNotification(current, notificationStartedRef.current)) return;

      await updateAndroidMediaNotification(createMediaNotificationState(current));
      notificationStartedRef.current = true;
    } catch (error) {
      console.error("[MediaNotification] Unable to synchronize native media notification.", error);
      window.dispatchEvent(new CustomEvent("chay-media-notification-status", {
        detail: { granted: false, error: error?.message || String(error) },
      }));
    }
  }, []);

  const syncAndroidNotificationRef = useRef(syncAndroidNotification);
  syncAndroidNotificationRef.current = syncAndroidNotification;

  useWebMediaSession(control, !isAndroidApp());

  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    let handle;
    subscribeAndroidMediaActions(({ action, position }) => {
      dispatchMediaNotificationAction(controlRef.current, action, { position });
    }).then((subscription) => {
      handle = subscription;
    }).catch((error) => {
      console.error("[MediaNotification] Unable to subscribe to native media actions.", error);
    });
    return () => handle?.remove();
  }, []);

  useEffect(() => {
    if (!isAndroidApp()) return;
    if (!control) {
      permissionResultRef.current = null;
      syncAndroidNotification();
      return;
    }

    syncAndroidNotification();
  }, [
    syncAndroidNotification,
    control?.id,
    control?.title,
    control?.subtitle,
    control?.artwork,
    control?.isPlaying,
    control?.isLive,
    Math.floor(control?.currentTime || 0),
    control?.duration,
    Boolean(control?.previous),
    Boolean(control?.next),
  ]);

  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      permissionResultRef.current = null;
      syncAndroidNotificationRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    const onOpenSettings = () => {
      openAndroidMediaNotificationSettings().catch((error) => {
        console.error("[MediaNotification] Unable to open Android notification settings.", error);
      });
    };
    window.addEventListener("chay-open-media-notification-settings", onOpenSettings);
    return () => window.removeEventListener("chay-open-media-notification-settings", onOpenSettings);
  }, []);
}