import { lazy, Suspense, useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { AnimatePresence } from "framer-motion";
import SplashScreen from "@/components/SplashScreen";
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { PreferencesProvider } from '@/lib/PreferencesContext';
import { Navigate } from 'react-router-dom';
import { NetworkProvider } from '@/lib/NetworkContext';
import RequiresOnline from '@/components/RequiresOnline';
// Chargés en parallèle (une seule fois) au lieu d'alourdir le bundle initial.
const homeImport = () => import("@/pages/Home");
const Layout = lazy(() => import('@/components/Layout'));
const LocationGate = lazy(() => import('@/components/LocationGate'));
const LocalLayout = lazy(() => import('@/components/LocalLayout'));
const LocalAccessNotice = lazy(() => import('@/components/LocalAccessNotice'));
// Lance le téléchargement de l'accueil dès l'évaluation du module, sans attendre le rendu.
homeImport();
const PageNotFound = lazy(() => import("./lib/PageNotFound"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Settings = lazy(() => import("@/pages/Settings"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Home = lazy(homeImport);
const Bible = lazy(() => import("@/pages/Bible"));
const Media = lazy(() => import("@/pages/Media"));
const Games = lazy(() => import("@/pages/Games"));
const Quiz = lazy(() => import("@/pages/Quiz"));
const QuizPlay = lazy(() => import("@/pages/QuizPlay"));
const QuizResults = lazy(() => import("@/pages/QuizResults"));
const WordScramble = lazy(() => import("@/pages/WordScramble"));
const WordScramblePlay = lazy(() => import("@/pages/WordScramblePlay"));
const WordScrambleResults = lazy(() => import("@/pages/WordScrambleResults"));
const Kids = lazy(() => import("@/pages/Kids"));
const Community = lazy(() => import("@/pages/Community"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const Donate = lazy(() => import("@/pages/Donate"));
const Contact = lazy(() => import("@/pages/Contact"));
const Admin = lazy(() => import("@/pages/Admin"));
const Messages = lazy(() => import("@/pages/Messages"));
import AppLoader from '@/components/AppLoader';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AudioPlayerProvider } from '@/lib/AudioPlayerContext';
import { RadioPlayerProvider } from '@/lib/RadioContext';
import { SplashScreen as CapacitorSplashScreen } from '@capacitor/splash-screen';
import { CapacitorBackHandler } from './components/CapacitorBackHandler';
import ConfirmHost from '@/components/ConfirmHost';
import ExternalLinkGuard from '@/components/ExternalLinkGuard';

const AuthenticatedApp = () => {
  const { isLocalMode, isLoggingOut, isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, checkAppState } = useAuth();

  // Déconnexion en cours : écran neutre jusqu'au rechargement sur l'accueil.
  if (isLoggingOut) return <AppLoader />;

  if (isLocalMode) {
    return <Suspense fallback={<AppLoader />}><Routes>
      <Route path="/login" element={navigator.onLine ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={navigator.onLine ? <Register /> : <Navigate to="/" replace />} />
      <Route path="/forgot-password" element={navigator.onLine ? <ForgotPassword /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={navigator.onLine ? <ResetPassword /> : <Navigate to="/" replace />} />
      <Route element={<LocalLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/bible" element={<Bible />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/don" element={<Navigate to="/donate" replace />} />
        <Route path="*" element={<LocalAccessNotice />} />
      </Route>
    </Routes></Suspense>;
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return <AppLoader offline={offline} />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    } else {
      // unknown — généralement un problème de connexion
      return <AppLoader offline retry={checkAppState} />;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<AppLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<LocationGate><Layout /></LocationGate>}>
          <Route path="/" element={<Home />} />
          <Route path="/bible" element={<Bible />} />
          <Route path="/media" element={<Media />} />
          <Route path="/games" element={<Games />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/quiz/play/:difficulty" element={<QuizPlay />} />
          <Route path="/quiz/results" element={<QuizResults />} />
          <Route path="/word-scramble" element={<WordScramble />} />
          <Route path="/word-scramble/play/:difficulty" element={<WordScramblePlay />} />
          <Route path="/word-scramble/results" element={<WordScrambleResults />} />
          <Route path="/kids" element={<Kids />} />
          <Route path="/community" element={<RequiresOnline><Community /></RequiresOnline>} />
          <Route path="/profile/:userId" element={<RequiresOnline><MemberProfile /></RequiresOnline>} />
          <Route path="/donate" element={<Donate />} />
          <Route path="/don" element={<Navigate to="/donate" replace />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/messages" element={<RequiresOnline><Messages /></RequiresOnline>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


// L'animation d'accueil ne s'affiche qu'une fois par session : elle ne repart
// donc plus à chaque actualisation (sinon /bible se relancerait dessus au F5).
const SPLASH_SESSION_KEY = "chay_splash_shown";

function App() {
  const [showSplash, setShowSplash] = useState(
    () => typeof sessionStorage === "undefined" || sessionStorage.getItem(SPLASH_SESSION_KEY) !== "1"
  );
  useEffect(() => {
    // Cache le splash natif Capacitor dès que React monte (double sécurité :
    // launchShowDuration est déjà à 0 dans capacitor.config.json).
    CapacitorSplashScreen.hide().catch(() => {});
    if (!showSplash) return undefined;
    // Marqué immédiatement : un actualisation pendant l'animation ne la rejoue pas.
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    // Durée = fin de l'animation raccourcie du splash (citation à delay 0.7s
    // + duration 0.4s), puis fondu de sortie 0.3s.
    const t = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(t);
  }, [showSplash]);

  return (
    <AuthProvider>
      <PreferencesProvider>
      <QueryClientProvider client={queryClientInstance}>
        <NetworkProvider>
        <AudioPlayerProvider>
          <RadioPlayerProvider>
          <Router>
            <CapacitorBackHandler />
            <ConfirmHost />
            <ExternalLinkGuard />
            <ScrollToTop />
            <ErrorBoundary>
              <AuthenticatedApp />
            </ErrorBoundary>
            <AnimatePresence>
              {showSplash && <SplashScreen key="splash" />}
            </AnimatePresence>
          </Router>
            <Toaster />
          </RadioPlayerProvider>
          </AudioPlayerProvider>
        </NetworkProvider>
      </QueryClientProvider>
      </PreferencesProvider>
    </AuthProvider>
  )
}

export default App