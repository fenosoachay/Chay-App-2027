import { useEffect } from "react";
import { probeLocationStatus } from "@/lib/locationGate";

// 1.4.1 : la position est FACULTATIVE (règles Google Play : une appli doit rester utilisable si l'on refuse une
// permission). Avant, l'appli entière était bloquée sans localisation. Désormais Android demande l'accord une fois
// au démarrage ; si le membre accepte, sa ville (position arrondie à ~5 km) apparaît sur la carte des membres des
// admins (useSuiviActivite) ; s'il refuse, l'appli fonctionne exactement pareil, sans carte.
export default function LocationGate({ children }) {
  useEffect(() => {
    probeLocationStatus().catch(() => {});
  }, []);
  return children;
}
