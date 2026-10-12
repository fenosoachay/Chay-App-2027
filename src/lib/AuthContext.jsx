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
  const [isLocalMode, setIsLocalMode] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
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

  useEffect(() => {
    window.addEventListener('offline', enterLocalMode);
    return () => window.removeEventListener('offline', enterLocalMode);
  }, []);

  const checkAppState = async () => {
    if (!navigator.onLine) { enterLocalMode(); return; }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        const publicSettings = await withTimeout(base44.app.getPublicSettings());
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
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
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
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
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    clearLocalSession();
    setIsLocalMode(true);
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
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
    base44.auth.logout(window.location.origin + '/login');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated,
      isLocalMode,
      isGuest: isLocalMode && !user,
      isLoadingAuth,
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};