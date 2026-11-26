import { useRef } from "react";
import { useOutlet, useLocation, useNavigationType } from "react-router-dom";

// Transition entre les pages (1.3.37) : seulement une entrée en CSS, sans animation de sortie.
// Avant, AnimatePresence (mode « wait ») attendait la fin de la sortie de l'ancienne page avant
// d'afficher la nouvelle : si l'appli passait en arrière-plan à ce moment-là (notification touchée,
// retour depuis une autre appli), la sortie ne finissait jamais et l'écran restait vide.
// Une animation CSS finit toujours, et la page reste visible même si elle est interrompue.
export default function AnimatedOutlet() {
  const outlet = useOutlet();
  const location = useLocation();
  const navType = useNavigationType();
  const cle = location.pathname + location.search;
  // La classe ne change qu'avec la page (jamais à un simple rafraîchissement) ; pas d'animation au démarrage.
  const etat = useRef(null);
  if (!etat.current) etat.current = { cle, classe: "" };
  else if (etat.current.cle !== cle) etat.current = { cle, classe: navType === "POP" ? "chay-page-retour" : "chay-page-entree" };
  return (
    <div key={cle} className={etat.current.classe}>
      {outlet}
    </div>
  );
}
