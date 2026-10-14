import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { readLocalSession, saveLocalSession, clearLocalSession } from '@/lib/localSession';

const AuthContext = createContext();

// Délai réservé aux connexions volontaires. Aucun appel réseau au démarrage.
const STARTUP_TIMEOUT_MS = 6000;
const withTimeout = (promise, ms = STARTUP_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Délai réseau dépassé')), ms)),
  ]);

const isNetworkFailure = (error) =>
  (typeof navigator !== 'undefined' && !navigator.onLine) ||
  !error?.status || error.status >= 500;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readLocalSession(appParams.token));
  // Jeton présent + en ligne : on démarre en chargement (et non en mode invité)
  // pour ne jamais montrer l'accueil invité avant la page connectée.
  const hasSessionAtStart = Boolean(appParams.token) && (typeof navigator === 'undefined' || navigator.onLine);
  const [isLocalMode, setIsLocalMode] = useState(!hasSessionAtStart);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(hasSessionAtStart);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(hasSessionAtStart);
  const [authError, setAuthError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authChecked, setAuthChecked] = useState(true);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // Aucun appel serveur au montage, même lorsque navigator.onLine vaut true.
  // La connexion est une action volontaire ; un profil mémorisé reste local.
  const enterLocalMode = () => {
    setUser(readLocalSession(appParams.token));
    setIsLocalMode(true);
    setIsAuthenticated(false);
    setAuthError(null);
    setAuthChecked(true);
    setIsLoadingPublicSettings(false);
    setIsLoadingAuth(false);
  };

  // Démarrage : si un jeton est conservé (localStorage, géré par le SDK), on
  // restaure la session tant que l'utilisateur ne s'est pas déconnecté lui-même.
  // Sans jeton : accueil en mode invité, aucun écran de connexion bloquant.
  // Hors ligne : on reste en mode local avec le profil mémorisé.
  useEffect(() => {
    try { sessionStorage.removeItem('chay_just_logged_in'); } catch { /* stockage indisponible */ }
    if (appParams.token && navigator.onLine) checkAppState();
  }, []);

  useEffect(() => {
    window.addEventListener('offline', enterLocalMode);
    return () => window.removeEventListener('offline', enterLocalMode);
  }, []);

  // Session maintenue : revalidation toutes les 23 h pendant l'utilisation, et
  // au retour sur l'application après une longue absence. Un échec réseau ne
  // déconnecte jamais ; seul un refus explicite du serveur (401/403) le fait.
  useEffect(() => {
    const REFRESH_MS = 23 * 60 * 60 * 1000;
    let last = Date.now();
    const refresh = () => {
      if (!appParams.token || !navigator.onLine) return;
      last = Date.now();
      checkUserAuth();
    };
    const interval = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > REFRESH_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const checkAppState = async () => {
    if (!navigator.onLine) { enterLocalMode(); return; }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        // Réglages publics et profil utilisateur demandés en parallèle (avant :
        // l'un après l'autre, ce qui doublait le temps d'attente au démarrage).
        const settingsPromise = withTimeout(base44.app.getPublicSettings());
        const userPromise = appParams.token ? checkUserAuth() : null;
        const publicSettings = await settingsPromise;
        setAppPublicSettings(publicSettings);

        if (userPromise) {
          await userPromise;
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setIsLocalMode(true);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        // Réseau absent / trop lent : si l'utilisateur s'est déjà connecté sur
        // cet appareil (jeton enregistré), on ouvre l'application en mode hors
        // ligne (Bible, dictionnaire, concordance sont embarqués).
        if (isNetworkFailure(appError)) {
          enterLocalMode();
          return;
        }
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            // Jeton refusé : retour à l'accueil invité, sans écran bloquant.
            enterLocalMode();
            return;
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: "Utilisateur non enregistré pour cette application"
            });
          } else {
            setAuthError({
              type: reason,
              message: "Accès refusé à l'application"
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: "Impossible de charger l'application"
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: "Une erreur inattendue est survenue"
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    if (!navigator.onLine) { enterLocalMode(); return; }
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await withTimeout(base44.auth.me());
      saveLocalSession(currentUser);
      setUser(currentUser);
      setIsLocalMode(false);
      setAuthError(null);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      // Hors ligne avec un jeton enregistré : on reste « connecté » localement.
      if (isNetworkFailure(error)) {
        enterLocalMode();
        return;
      }
      setIsAuthenticated(false);

      // Jeton expiré ou refusé par le serveur : on le retire et on revient en
      // mode invité (accueil), sans écran de connexion bloquant.
      if (error.status === 401 || error.status === 403) {
        try {
          window.localStorage.removeItem('base44_access_token');
          window.localStorage.removeItem('token');
        } catch { /* stockage indisponible */ }
        clearLocalSession();
        setUser(null);
        setIsLocalMode(true);
        setAuthError(null);
      } else {
        // Autre échec : jamais d'app « connectée » sans utilisateur vérifié.
        setIsLocalMode(true);
      }
    }
  };

  // Déconnexion explicite : on vide la session locale, puis on revient à
  // l'accueil invité ("/"), jamais vers /login.
  const logout = (shouldRedirect = true) => {
    clearLocalSession();
    try { sessionStorage.removeItem('chay_just_logged_in'); } catch { /* ignoré */ }
    // Écran de chargement neutre jusqu'au rechargement : aucun écran intermédiaire.
    if (shouldRedirect) setIsLoggingOut(true);
    setIsLocalMode(true);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);

    if (shouldRedirect) {
      // Le SDK supprime le jeton puis efface le cookie serveur avant de revenir à "/".
      base44.auth.logout(window.location.origin + '/');
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  const deleteAccount = async () => {
    if (!user?.id) throw new Error('Aucun utilisateur connecté');
    await base44.entities.User.delete(user.id);
    clearLocalSession();
    setIsLocalMode(true);
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(window.location.origin + '/');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated,
      isLocalMode,
      isGuest: isLocalMode && !user,
      isLoadingAuth,
      isLoggingOut,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      deleteAccount,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return context;
};