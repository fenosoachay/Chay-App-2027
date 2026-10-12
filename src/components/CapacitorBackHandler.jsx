import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { getBackAction, getBackFallback, hasInAppHistory } from '@/lib/backNavigation';
import { hasOpenOverlay } from '@/hooks/useBackHandler';
import { subscribeMediaControl } from '@/lib/mediaControl';

// Unique écouteur du bouton retour physique d'Android (mode connecté ET hors ligne).
// Enregistré une seule fois ; la ref donne toujours accès à la page courante.
export function CapacitorBackHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeMediaRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { location, navigate };

  useEffect(() => subscribeMediaControl((control) => { activeMediaRef.current = control; }), []);

  useEffect(() => {
    let listener;
    let cancelled = false;

    const handleBackButton = () => {
      const { location: loc, navigate: nav } = stateRef.current;
      const action = getBackAction({
        hasOverlay: hasOpenOverlay(),
        hasHistory: hasInAppHistory(window.history.state),
        isNative: true,
        isPlaying: Boolean(activeMediaRef.current?.isPlaying),
      });

      if (action === 'close-overlay') {
        window.history.back();
        return;
      }
      if (action === 'navigate-back') {
        nav(-1);
        return;
      }
      if (action === 'minimize-app') {
        App.minimizeApp().catch(() => {});
        return;
      }
      // Sur l'accueil : on ne fait rien (l'app ne se ferme pas par accident).
      const fallback = getBackFallback(loc.pathname, loc.search);
      if (loc.pathname === '/' && fallback === '/') return;
      nav(fallback, { replace: true });
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
  }, []);

  return null;
}

export default CapacitorBackHandler;