import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { appelChay } from "@/api/chayApi";
import { IS_POCKETBASE } from "@/api/backendConfig";
import { usePreferences } from "@/lib/PreferencesContext";
import { arrondirCoord, creerCompteur, notePositionEnvoyee, positionAEnvoyer } from "@/lib/suiviActivite";

const INTERVALLE_MS = 60 * 1000;
const jourLocal = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ

/** Position de l'appareil, arrondie à ~5 km (null si indisponible). La permission est déjà demandée par l'app. */
function lirePosition() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: arrondirCoord(p.coords.latitude), lon: arrondirCoord(p.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 3600 * 1000, timeout: 20000 }
    );
  });
}

// Tableau de bord de l'app (1.3.25) : temps passé, sections ouvertes et ville du membre connecté, envoyés au
// serveur environ une fois par minute (voir lib/suiviActivite.js). Rien n'est envoyé sans compte connecté.
export default function useSuiviActivite(user) {
  const location = useLocation();
  const compteur = useRef(null);
  if (!compteur.current) compteur.current = creerCompteur();
  const actif = IS_POCKETBASE && Boolean(user?.id);
  // Réglages › Confidentialité › « Apparaître sur la carte des membres » (activé par défaut).
  const { prefs } = usePreferences();
  const surCarte = useRef(true);
  surCarte.current = prefs?.carte_membres !== false;

  useEffect(() => {
    if (actif) compteur.current.page(location.pathname);
  }, [actif, location.pathname]);

  useEffect(() => {
    if (!actif) return undefined;
    const c = compteur.current;
    let envoiEnCours = false;
    let arrete = false;

    const envoyer = async ({ keepalive = false } = {}) => {
      if (envoiEnCours || (arrete && !keepalive)) return;
      const donnees = c.lire();
      const jour = jourLocal();
      // Une fois par jour : la ville (ou, si le membre a retiré « Apparaître sur la carte », l'effacement).
      const carteDuJour = positionAEnvoyer(jour);
      if (!donnees.secondes && !Object.keys(donnees.sections).length && !carteDuJour) return;
      envoiEnCours = true;
      try {
        const corps = { ...donnees };
        if (carteDuJour && !surCarte.current) corps.sansPosition = true;
        if (carteDuJour && surCarte.current && !keepalive) {
          const pos = await lirePosition();
          if (pos?.lat !== null && pos?.lat !== undefined) Object.assign(corps, pos);
        }
        const r = await appelChay("/api/chay/activite", { methode: "POST", corps, keepalive });
        if (r && !r.ignore) {
          c.confirmer(donnees);
          if (corps.lat !== undefined || corps.sansPosition) notePositionEnvoyee(jour);
        }
      } catch {
        /* hors connexion : réessai au prochain envoi */
      } finally {
        envoiEnCours = false;
      }
    };

    const onVisibilite = () => {
      const visible = document.visibilityState === "visible";
      c.visible(visible);
      if (!visible) envoyer({ keepalive: true });
    };
    c.visible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilite);
    const premier = setTimeout(() => envoyer(), 15 * 1000);
    const minuteur = setInterval(() => envoyer(), INTERVALLE_MS);
    return () => {
      arrete = true;
      clearTimeout(premier);
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", onVisibilite);
      c.visible(false);
    };
  }, [actif]);
}
