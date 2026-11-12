import { base44 } from "@/api/base44Client";
import { routeNotification } from "@/lib/routesNotification";

/** Charge la ligne Content d'une notification (contenu publié) même si aucune liste n'est chargée. */
export const chargerContenu = (id) => base44.entities.Content.get(id);

/** Ouvre l'écran précis d'une notification (push ou cloche). */
export async function ouvrirNotification(data, navigate) {
  navigate(await routeNotification(data, chargerContenu));
}
