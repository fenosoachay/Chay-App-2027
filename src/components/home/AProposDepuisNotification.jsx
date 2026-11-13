import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AboutDialog from "@/components/home/AboutDialog";

// Notification « Nouvelle version » (route /?apropos=1, push Android, push navigateur) : ouvre « À propos »
// (bouton de téléchargement). Monté dans Layout, AU-DESSUS des pages : AnimatedOutlet remonte la page dès que
// l'adresse change (clé pathname + search) ; avant la 1.3.9, la fenêtre était ouverte dans l'accueil, qui était
// aussitôt remonté quand le paramètre était retiré, et « À propos » se refermait sans être vu.
export const PARAM_APROPOS = "apropos";

export default function AProposDepuisNotification() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!searchParams.has(PARAM_APROPOS)) return;
    setOuvert(true);
    const next = new URLSearchParams(searchParams);
    next.delete(PARAM_APROPOS);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  return <AboutDialog open={ouvert} onOpenChange={setOuvert} />;
}
