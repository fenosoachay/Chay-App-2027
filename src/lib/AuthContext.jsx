import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { base44 } from '@/api/base44Client';
import { IS_POCKETBASE, readPocketBaseToken } from '@/api/backendConfig';
import { appParams } from '@/lib/app-params';
import { readLocalSession, saveLocalSession, clearLocalSession } from '@/lib/localSession';
import { decisionApresEchec, decisionHorsLigne, doitVerifierAuRetour, etatInitial } from '@/lib/sessionPolicy';
import { desactiverAvantDeconnexion } from '@/lib/deviceTokenSync';

// Jeton lu au moment voulu (et non figé au chargement du module : après une connexion dans la même
// session, appParams.token ne le connaît pas).
const jetonActuel = () => (IS_POCKETBASE ? readPocketBaseToken() : appParams.token);
const enLigne = () => typeof navigator === 'undefined' || navigator.onLine;

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
  // Lancement : jeton + en ligne -> vérification ; jeton + hors ligne + profil mémorisé -> app complète
  // (session gardée, vérifiée au retour du réseau) ; sinon accueil invité (mode local).
  const [initial] = useState(() => {
    const jeton = jetonActuel();
    const profil = readLocalSession(jeton);
    return { profil, ...etatInitial({ jeton, enLigne: enLigne(), profil }) };
  });
  const [user, setUser] = useState(initial.profil);
  const [isLocalMode, setIsLocalMode] = useState(initial.modeLocal);
  const [isAuthenticated, setIsAuthenticated] = useState(initial.connecte);
  const [isLoadingAuth, setIsLoadingAuth] = useState(initial.chargement);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(initial.chargement);
  const [authError, setAuthError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authChecked, setAuthChecked] = useState(true);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const essaisRef = useRef(0);
  const nouvelEssaiRef = useRef(null);
  const derniereVerificationRef = useRef(Date.now());

  // Mode local (accueil invité) : seulement quand AUCUNE session n'est connue.
  const enterLocalMode = () => {
    setUser(readLocalSession(jetonActuel()));
    setIsLocalMode(true);
    setIsAuthenticated(false);
    setAuthError(null);
    setAuthChecked(true);
    setIsLoadingPublicSettings(false);
    setIsLoadingAuth(false);
  };

  // Session gardée malgré un échec temporaire (hors ligne, délai, 429, 5xx) : app complète avec le
  // dernier profil connu ; le bandeau « hors ligne » de la mise en page signale la coupure.
  const garderSession = (profil) => {
    setUser((actuel) => actuel || profil);
    setIsLocalMode(false);
    setIsAuthenticated(true);
    setAuthError(null);
    setAuthChecked(true);
    setIsLoadingPublicSettings(false);
    setIsLoadingAuth(false);
  };

  // Hors ligne (évènement « offline » ou lancement hors ligne) : la session est gardée si elle est connue.
  const passerHorsLigne = () => {
    const jeton = jetonActuel();
    const profil = readLocalSession(jeton);
    if (decisionHorsLigne({ jeton, profil }) === 'garder') garderSession(profil);
    else enterLocalMode();
  };

  const programmerNouvelEssai = (delai) => {
    clearTimeout(nouvelEssaiRef.current);
    if (delai) nouvelEssaiRef.current = setTimeout(() => { checkUserAuth({ enArrierePlan: true }); }, delai);
  };

  // Démarrage : jeton conservé (localStorage, géré par le SDK) et en ligne -> vérification.
  // Sans jeton : accueil en mode invité, aucun écran de connexion bloquant.
  useEffect(() => {
    try { sessionStorage.removeItem('chay_just_logged_in'); } catch { /* stockage indisponible */ }
    if (initial.verifier) checkAppState();
    return () => clearTimeout(nouvelEssaiRef.current);
  }, []);

  // Profil modifié (Paramètres, photo, préférences…) : le nouveau profil remplace aussitôt l'ancien,
  // partout dans l'appli et dans la session mémorisée (1.3.37).
  useEffect(() => {
    const onProfil = (e) => {
      const maj = e.detail;
      if (!maj?.id) return;
      setUser((actuel) => (actuel && actuel.id !== maj.id ? actuel : { ...(actuel || {}), ...maj }));
      try { saveLocalSession({ ...(readLocalSession(jetonActuel()) || {}), ...maj }); } catch { /* stockage indisponible */ }
    };
    window.addEventListener('chay-profil-maj', onProfil);
    return () => window.removeEventListener('chay-profil-maj', onProfil);
  }, []);

  // Coupure : session gardée. Retour du réseau : vérification (sans écran de chargement).
  useEffect(() => {
    const onOffline = () => passerHorsLigne();
    const onOnline = () => { if (jetonActuel()) checkUserAuth({ enArrierePlan: true }); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Session maintenue : à chaque retour dans l'app (APK : appStateChange actif ; site : onglet visible),
  // au plus une fois par minute, et toutes les 23 h pendant l'utilisation. Le rafraîchissement prolonge
  // le jeton (authRefresh). Un échec réseau ne déconnecte jamais ; seule une révocation réelle le fait.
  useEffect(() => {
    const REFRESH_MS = 23 * 60 * 60 * 1000;
    const verifier = () => {
      if (!jetonActuel() || !enLigne()) return;
      if (!doitVerifierAuRetour(derniereVerificationRef.current)) return;
      checkUserAuth({ enArrierePlan: true });
    };
    const interval = setInterval(() => { derniereVerificationRef.current = 0; verifier(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') verifier(); };
    document.addEventListener('visibilitychange', onVisible);
    let appHandle = null;
    let annule = false;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) verifier(); })
      .then((h) => { if (annule) h.remove(); else appHandle = h; })
      .catch(() => { /* web : pas d'évènement natif */ });
    return () => {
      annule = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      appHandle?.remove();
    };
  }, []);

  const checkAppState = async () => {
    if (!navigator.onLine) { passerHorsLigne(); return; }
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        // Réglages publics et profil utilisateur demandés en parallèle (avant :
        // l'un après l'autre, ce qui doublait le temps d'attente au démarrage).
        const settingsPromise = withTimeout(base44.app.getPublicSettings());
        const userPromise = jetonActuel() ? checkUserAuth() : null;
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

        // Réseau absent / trop lent / limite de requêtes : la session connue est gardée (app complète,
        // bandeau « hors ligne ») ; sans session connue, accueil invité comme avant.
        if (isNetworkFailure(appError) || appError?.status === 429 || appError?.status === 408) {
          passerHorsLigne();
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

  // enArrierePlan : vérification au retour du réseau ou de l'app, sans écran de chargement.
  const checkUserAuth = async ({ enArrierePlan = false } = {}) => {
    if (!navigator.onLine) { passerHorsLigne(); return; }
    derniereVerificationRef.current = Date.now();
    try {
      if (!enArrierePlan) setIsLoadingAuth(true);
      const currentUser = await withTimeout(base44.auth.me());
      saveLocalSession(currentUser);
      setUser(currentUser);
      setIsLocalMode(false);
      setAuthError(null);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      essaisRef.current = 0;
      clearTimeout(nouvelEssaiRef.current);
    } catch (error) {
      console.error('User auth check failed:', error);
      const jeton = jetonActuel();
      const decision = decisionApresEchec({ erreur: error, jeton, profil: readLocalSession(jeton), essai: essaisRef.current });
      setIsLoadingAuth(false);
      setAuthChecked(true);

      if (decision.action === 'deconnecter') {
        // Révocation réelle (401/403/404 de authRefresh) : jeton retiré (l'adaptateur PocketBase vide déjà
        // le sien), accueil invité, sans écran de connexion bloquant.
        try {
          window.localStorage.removeItem('base44_access_token');
          window.localStorage.removeItem('token');
        } catch { /* stockage indisponible */ }
        clearLocalSession();
        clearTimeout(nouvelEssaiRef.current);
        essaisRef.current = 0;
        setUser(null);
        setIsAuthenticated(false);
        setIsLocalMode(true);
        setAuthError(null);
        return;
      }
      // Échec temporaire (réseau, délai, 429, 5xx) : jamais de déconnexion ; nouvel essai plus tard.
      essaisRef.current += 1;
      programmerNouvelEssai(decision.reessayerDans);
      if (decision.action === 'garder') garderSession(readLocalSession(jeton));
      else enterLocalMode();
    }
  };

  // Déconnexion explicite : on vide la session locale, puis on revient à
  // l'accueil invité ("/"), jamais vers /login.
  const logout = (shouldRedirect = true) => {
    // 1.3.43 : cet appareil ne reçoit plus les notifications du compte qui se déconnecte (fait AVANT de quitter
    // la session, sinon le serveur refuse). 2,5 s au plus, puis la déconnexion continue quoi qu'il arrive.
    // Déconnexion forcée (session déjà invalide) : tout de suite, comme avant.
    if (!shouldRedirect) { terminerDeconnexion(false); return; }
    setIsLoggingOut(true);
    desactiverAvantDeconnexion(base44.entities).catch(() => {}).finally(() => terminerDeconnexion(true));
  };
  const terminerDeconnexion = (shouldRedirect) => {
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