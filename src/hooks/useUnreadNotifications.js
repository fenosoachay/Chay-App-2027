import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { visibleDansCloche } from "@/lib/routesNotification";

/**
 * Compte les notifications non lues du user connecté (sauf les messages privés, hors cloche).
 * Se met à jour en temps réel via l'abonnement à UserNotification.
 */
export function useUnreadNotifications(user) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setCount(0);
      return;
    }
    let alive = true;
    let reloadTimer;

    const load = async () => {
      try {
        let total = 0;
        let skip = 0;
        while (skip < 10000) {
          const rows = await base44.entities.UserNotification.filter(
            { user_id: user.id, is_read: false },
            "-created_date",
            500,
            skip
          );
          if (!Array.isArray(rows)) {
            throw new Error("Réponse de notifications invalide.");
          }
          total += rows.filter(visibleDansCloche).length;
          if (rows.length < 500) break;
          skip += rows.length;
        }
        if (alive) setCount(total);
      } catch (error) {
        console.error("[Notifications] Impossible de calculer les notifications non lues.", error);
      }
    };

    const scheduleLoad = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(load, 200);
    };

    load();
    const unsub = base44.entities.UserNotification.subscribe(scheduleLoad);

    return () => {
      alive = false;
      clearTimeout(reloadTimer);
      if (typeof unsub === "function") unsub();
    };
  }, [user?.id]);

  return count;
}