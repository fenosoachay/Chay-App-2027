import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Facebook, Youtube, Shield, Globe } from "lucide-react";
import PullToRefresh from "@/components/PullToRefresh";
import SplitClock from "@/components/home/SplitClock";
import QuestionLogiqueSection from "@/components/home/QuestionLogiqueSection";
import QuickAccess from "@/components/home/QuickAccess";
import LocalBibleAccess from "@/components/home/LocalBibleAccess";
// import NewContentsSection from "@/components/home/NewContentsSection"; // Supprimé si vous voulez garder la suppression des nouveautés
import ProchaineReunionSection from "@/components/home/ProchaineReunionSection";

export default function Home() {
  const { user, isLocalMode } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const loadHome = () => setRefreshKey((k) => k + 1);

  return (
    <PullToRefresh mode="window" onRefresh={loadHome}>
      <div className="mx-auto max-w-6xl px-6 md:px-8 py-8 md:py-12">
        
        {/* Welcome Header */}
        <section className="animate-float-in flex items-center justify-center gap-4 text-center">
          <div>
            <h1 className="font-display font-extrabold text-2xl md:text-4xl text-foreground">
              <span className="brand-gradient-text">ÉGLISE CHAY</span>
            </h1>
            <p className="mt-1 text-lg md:text-2xl font-display font-bold text-foreground/80">
              Shalom
            </p>
          </div>
        </section>

        {/* Texte d'accueil malgache */}
        <p className="mt-3 text-center text-sm md:text-xl text-foreground/60 max-w-xl mx-auto font-body animate-float-in" style={{ animationDelay: "0.05s" }}>
          Tongasoa eto amin'ny Fiangonana Chay izay mitory ny Fanjakan'Andriamanitra.
        </p>

        {/* Horloge divisée */}
        <div className="animate-float-in mt-6" style={{ animationDelay: "0.15s" }}>
          {!isLocalMode && <SplitClock />}
        </div>

        {/* Question Logique */}
        <div className="animate-float-in mt-6" style={{ animationDelay: "0.2s" }}>
          {!isLocalMode && <QuestionLogiqueSection refreshKey={refreshKey} />}
        </div>

        {/* Prochaine réunion */}
        <div className="animate-float-in mt-6" style={{ animationDelay: "0.25s" }}>
          {!isLocalMode && <ProchaineReunionSection refreshKey={refreshKey} />}
        </div>

        {/* Accès rapide */}
        <div className="animate-float-in mt-6" style={{ animationDelay: "0.3s" }}>
          {isLocalMode ? <LocalBibleAccess /> : <QuickAccess />}
        </div>

        {/* Nouveautés - Commenté ou supprimé selon votre préférence précédente */}
        {/* 
        <div className="animate-float-in mt-6" style={{ animationDelay: "0.35s" }}>
          <NewContentsSection />
        </div> 
        */}

        {/* Footer avec liens sociaux */}
        <footer className="mt-12 pt-8 border-t border-border pb-6 flex flex-col items-center gap-6">
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://www.chay.fr/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
              aria-label="Site Web Église Chay"
            >
              <Globe className="h-5 w-5" />
            </a>

            <a
              href="https://www.facebook.com/www.chay.fr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
              aria-label="Facebook"
            >
              <Facebook className="h-5 w-5" />
            </a>

            <a
              href="https://www.youtube.com/@EgliseChay.fr-tv"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
              aria-label="YouTube"
            >
              <Youtube className="h-5 w-5" />
            </a>

            <a
              href="https://www.tiktok.com/@anjahamintsoa"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
              aria-label="TikTok"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                focusable="false"
                className="h-5 w-5"
              >
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
              </svg>
            </a>

            {user?.role === "admin" && (
              <Link
                to="/admin"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all duration-300 shadow-sm"
                aria-label="Administration"
              >
                <Shield className="h-5 w-5" />
              </Link>
            )}
          </div>
        </footer>
      </div>
    </PullToRefresh>
  );
}