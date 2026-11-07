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

    const load = async () => {
      let count = 0;
      let skip = 0;
      try {
        while (skip < 10000) {
          const page = await base44.entities.Message.list("-created_date", 500, skip);
          if (!Array.isArray(page)) throw new Error("Réponse de messages invalide.");
          // Mode PocketBase : un admin voit tous les messages (règles) ; on ne compte que
          // ceux des conversations où il participe (sinon le badge affiche « 99+ »).
          count += page.filter((message) =>
            isUnreadIncomingMessage(message, user.id) &&
            (!IS_POCKETBASE || (Array.isArray(message.participant_ids) && message.participant_ids.includes(user.id)))
          ).length;
          if (page.length < 500) break;
          skip += page.length;
        }
        if (skip >= 10000) {
          console.warn("[Messages] Le compteur non lu est limité aux 10 000 messages récents.");
        }
        if (!stopped) setUnread(count);
      } catch (error) {
        console.error("[Messages] Impossible de calculer les messages non lus.", error);
      }
    };
    const scheduleLoad = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(load, 200);
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