import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { IS_POCKETBASE } from "@/api/backendConfig";
import { isUnreadIncomingMessage } from "@/lib/messageNotifications";

// Counts unread messages across all of the user's conversations.
// RLS scopes Message.list() to conversations the user participates in.
export function useUnreadMessages(user) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnread(0);
      return;
    }
    let stopped = false;
    let reloadTimer;

    // 1.3.35 : le serveur compte lui-même (une seule petite requête) au lieu de renvoyer jusqu'à 10 000
    // messages à chaque événement : c'était la plus grosse charge du serveur quand beaucoup de membres sont
    // connectés. Non lus = messages de MES conversations, envoyés par un autre, que je n'ai pas lus.
    const load = async () => {
      try {
        const count = IS_POCKETBASE
          ? await base44.entities.Message.count({
            participant_ids: user.id,
            read_by: { $ne: user.id },
            sender_id: { $ne: user.id },
          })
          : await compterAncienneMethode();
        if (!stopped) setUnread(Number(count) || 0);
      } catch (error) {
        console.error("[Messages] Impossible de calculer les messages non lus.", error);
      }
    };
    // Base44 (ancien mode) : lecture des messages, comme avant.
    const compterAncienneMethode = async () => {
      const page = await base44.entities.Message.list("-created_date", 500);
      return (Array.isArray(page) ? page : []).filter((m) => isUnreadIncomingMessage(m, user.id)).length;
    };
    const scheduleLoad = () => {
      clearTimeout(reloadTimer);
      // Plusieurs événements d'affilée (messages marqués « lu ») : un seul recomptage.
      reloadTimer = setTimeout(load, 1500);
    };

    load();
    const unsubM = base44.entities.Message.subscribe(scheduleLoad);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearTimeout(reloadTimer);
      unsubM();
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id]);

  return unread;
}