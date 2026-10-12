import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Admin : nombre de demandes de don non lues + toast en temps réel à chaque nouvelle demande.
export function useDonationAlerts(enabled) {
  const { toast } = useToast();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    setUnread(await base44.entities.DonationRequest.count({ is_read: { $ne: true } }));
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    return base44.entities.DonationRequest.subscribe((event) => {
      if (event.type === "create") {
        toast({
          title: "❤️ Nouvelle demande de don",
          description: `${event.data.username} veut faire un don, contactez-le.`,
        });
      }
      refresh();
    });
  }, [enabled, refresh, toast]);

  return { unread, refresh };
}