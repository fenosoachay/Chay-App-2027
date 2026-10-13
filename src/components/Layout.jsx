import React, { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, BookOpen, PlayCircle, Gamepad2, Bell, User, ChevronLeft, Settings, MessageCircle } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import AnimatedOutlet from "@/components/AnimatedOutlet";
import AutoOpenAudioPlayer from "@/components/player/AutoOpenAudioPlayer";
import PullDownMediaBar from "@/components/PullDownMediaBar";
import UniversalMediaSurface from "@/components/UniversalMediaSurface";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/lib/AuthContext";
import { usePreferences } from "@/lib/PreferencesContext";
import { usePresenceHeartbeat } from "@/hooks/usePresence";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { syncWebPush, disableWebPush, onWebPushNotificationClick } from "@/lib/webPush";
import NotificationBanner from "@/components/NotificationBanner";
import { useMediaSessionSync } from "@/hooks/useMediaSessionSync";
import {
  getBackAction,
  getBackFallback,
  hasInAppHistory,
} from "@/lib/backNavigation";
import { hasOpenOverlay } from "@/hooks/useBackHandler";
import { subscribeMediaControl } from "@/lib/mediaControl";

const NAV = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/community", label: "Communauté", icon: Users },
  { to: "/bible", label: "Bible", icon: BookOpen },
  { to: "/media", label: "Multimédia", icon: PlayCircle },
  { to: "/games", label: "Jeux", icon: Gamepad2 },
];

const ROOT_TABS = NAV.map((n) => n.to);

export default function Layout() {
  const { user, isAuthenticated } = useAuth();
  const { prefs } = usePreferences();
  const [activeMedia, setActiveMedia] = useState(null);
  useEffect(() => subscribeMediaControl(setActiveMedia), []);
  useMediaSessionSync(activeMedia);
  usePresenceHeartbeat(user);
  const unread = useUnreadMessages(user);
  const notifUnread = useUnreadNotifications(user);
  const [lastParams, setLastParams] = useState({});
  const location = useLocation();
  const navigate = useNavigate();
  usePushNotifications(navigate);
  const webPushSynced = useRef(false);
  const goBack = () => {
    const action = getBackAction({
      hasOverlay: hasOpenOverlay(),
      hasHistory: hasInAppHistory(window.history.state),
      isNative: false,
      isPlaying: Boolean(activeMedia?.isPlaying),
    });
    if (action === "close-overlay") {
      window.history.back();
      return;
    }
    if (action === "navigate-back") {
      navigate(-1);
    } else if (action === "minimize-app") {
      CapacitorApp.minimizeApp().catch((error) => {
        console.warn("[Layout] Unable to minimize while media is playing.", error);
      });
    } else {
      navigate(getBackFallback(location.pathname, location.search));
    }
  };

  // Push navigateur : (ré)abonne silencieusement si la permission est déjà
  // accordée ; désabonne cet appareil à la déconnexion (comme le token FCM).
  useEffect(() => {
    if (
      isAuthenticated &&
      user?.id &&
      prefs.notifications_enabled !== false &&
      prefs.notif_push !== false
    ) {
      syncWebPush(user.id).finally(() => {
        webPushSynced.current = true;
      });
    } else if (!isAuthenticated && webPushSynced.current) {
      webPushSynced.current = false;
      disableWebPush();
    }
  }, [isAuthenticated, prefs.notifications_enabled, prefs.notif_push, user?.id]);

  // Clic sur une notification push navigateur : ouvre la bonne page.
  useEffect(
    () => onWebPushNotificationClick((data) => navigate(data?.url || "/")),
    [navigate]
  );

  const showBack = !ROOT_TABS.includes(location.pathname);

  // Preserve per-tab sub-view params (?cat=, ?c=, ?game=) so switching tabs restores them
  useEffect(() => {
    if (location.search) {
      setLastParams((p) => ({ ...p, [location.pathname]: location.search }));
    }
  }, [location.pathname, location.search]);

  // Note : React Router gère nativement la navigation "pop" (bouton retour
  // du navigateur, geste Android). On ne déclenche PAS navigate(-1) ici
  // pour éviter une double navigation qui ferait sauter directement sur
  // la page d'accueil.

  const navTarget = (path, end = false) => {
    const isActive = end
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(path + "/");
    if (isActive) return path; // tapping the active tab resets to its root
    if (path === "/media") return path; // Multimédia revient toujours à la grille d'accueil
    if (path === "/messages") return path; // Messages revient toujours à la liste des conversations
    if (path === "/bible") return path; // La Bible revient toujours au menu des modules
    const stored = lastParams[path];
    return stored ? `${path}${stored}` : path;
  };

  const urlParams = new URLSearchParams(location.search);
  const hasSubView =
    urlParams.get("cat") ||
    urlParams.get("c") ||
    urlParams.get("game") ||
    urlParams.get("view"); // sous-écrans Biblette (lecteur, dictionnaire, recherche)

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <NotificationBanner />
      {/* Desktop floating glass rail */}
      <header className="hidden md:flex sticky top-0 z-40 px-6 pt-5">
        <div className="mx-auto w-full max-w-6xl flex items-center justify-between gap-2 rounded-full border border-border bg-background/70 backdrop-blur-xl px-3 lg:px-6 py-3 glow-soft">
          <Link to="/" className="flex items-center">
            <BrandLogo className="h-9 w-9" />
          </Link>

          <nav aria-label="Navigation principale" className="flex items-center gap-0.5 lg:gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={navTarget(item.to, item.end)}
                end={item.end}
                className={({ isActive }) =>
                  `px-2.5 lg:px-4 py-2 rounded-full text-xs lg:text-sm font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
            <ThemeToggle />
            <Link to="/notifications" className="relative h-11 w-11 grid place-items-center rounded-full border border-border hover:bg-muted transition" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {notifUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold border-2 border-background">{notifUnread > 9 ? "9+" : notifUnread}</span>
              )}
            </Link>
            <Link to={navTarget("/messages")} className="relative h-11 w-11 grid place-items-center rounded-full border border-border hover:bg-muted transition" aria-label="Messages">
              <MessageCircle className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold border-2 border-background">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link to="/settings" className="h-11 w-11 grid place-items-center rounded-full brand-gradient text-white shadow-sm" aria-label="Paramètres">
              <User className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile top bar — hidden on sub-views to avoid double headers */}
      {!hasSubView && (
      <header
        className="md:hidden sticky top-0 z-40 px-4 bg-background/80 backdrop-blur-xl"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBack ? (
              <button
                onClick={goBack}
                className="h-11 w-11 grid place-items-center rounded-full border border-border hover:bg-muted transition"
                aria-label="Retour"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link to="/" className="flex items-center">
                <BrandLogo className="h-8 w-8" />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Link to={navTarget("/messages")} className="relative h-9 w-9 grid place-items-center rounded-full border border-border" aria-label="Messages">
              <MessageCircle className="h-[17px] w-[17px]" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 grid place-items-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold border-2 border-background">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link to="/notifications" className="relative h-9 w-9 grid place-items-center rounded-full border border-border" aria-label="Notifications">
              <Bell className="h-[17px] w-[17px]" />
              {notifUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 grid place-items-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold border-2 border-background">{notifUnread > 9 ? "9+" : notifUnread}</span>
              )}
            </Link>
            <ThemeToggle />
            <Link
              to="/settings"
              className="h-9 w-9 grid place-items-center rounded-full border border-border"
              aria-label="Paramètres"
            >
              <Settings className="h-[17px] w-[17px]" />
            </Link>
          </div>
        </div>
      </header>
      )}

      <main className="pb-28 md:pb-12">
        {hasSubView && (
          <div className="md:hidden" style={{ height: "env(safe-area-inset-top)" }} />
        )}
        <AnimatedOutlet />
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Navigation principale" className="md:hidden fixed bottom-0 inset-x-0 z-40 px-3" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-md flex items-center justify-around rounded-full border border-border bg-background/90 backdrop-blur-xl px-1.5 py-1.5 glow-soft">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.end ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={navTarget(item.to, item.end)}
                end={item.end}
                aria-label={item.label}
                className="flex items-center justify-center px-2 py-1 rounded-full transition"
              >
                <span
                  className={`grid place-items-center h-9 w-9 rounded-full transition-all ${
                    active ? "brand-gradient text-white shadow-sm" : "text-foreground/55"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.5 : 2} />
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <PullDownMediaBar />
      <AutoOpenAudioPlayer />
      <UniversalMediaSurface />
      </div>
  );
}