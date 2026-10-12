import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';

// Relie le bouton retour physique d'Android à l'historique de React Router.
// Monté uniquement dans LocalLayout : Layout (mode connecté) gère déjà son propre écouteur.
export function CapacitorBackHandler() {
  const location = useLocation();

  useEffect(() => {
    let listener;
    let cancelled = false;

    const handleBackButton = () => {
      // Sur l'accueil, on ne fait rien pour ne pas fermer l'app par accident.
      if (location.pathname === '/') return;
      window.history.back();
    };

    App.addListener('backButton', handleBackButton)
      .then((handle) => {
        if (cancelled) handle.remove();
        else listener = handle;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [location.pathname]);

  return null;
}

export default CapacitorBackHandler;