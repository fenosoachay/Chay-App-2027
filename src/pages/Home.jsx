import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import PullToRefresh from "@/components/PullToRefresh";
import NouveauteWidget from "@/components/home/NouveauteWidget";
import QuestionLogiqueSection from "@/components/home/QuestionLogiqueSection";
import QuickAccess from "@/components/home/QuickAccess";
import LocalBibleAccess from "@/components/home/LocalBibleAccess";
import AuthButtons from "@/components/home/AuthButtons";
import ProchaineReunionSection from "@/components/home/ProchaineReunionSection";
import VersetDuJourSection from "@/components/home/VersetDuJourSection";
import AnimatedBlobs from "@/components/home/AnimatedBlobs";
import HomeSocialLinks from "@/components/home/HomeSocialLinks";

export default function Home() {
  const { user, isLocalMode, isAuthenticated } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const loadHome = () => setRefreshKey((k) => k + 1);

  return (
    <PullToRefresh mode="window" onRefresh={loadHome}>
      <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
        <AnimatedBlobs />
        <div className="relative z-10 mx-auto max-w-6xl px-6 md:px-8 py-4 md:py-12">

          {/* Welcome Header */}
          <section className="animate-float-in flex items-center justify-center gap-4 text-center">
            <div>
              <h1 className="font-display font-extrabold text-4xl md:text-6xl text-foreground">
                <span className="brand-gradient-text">ÉGLISE CHAY</span>
              </h1>
              <div className="mx-auto mt-2 h-[3px] w-16 rounded-full brand-gradient" />
              <p className="mt-3 text-lg md:text-2xl font-display font-bold text-foreground/80">
                {isLocalMode || !user?.first_name ? "Shalom" : `Shalom ${user.first_name}`}
              </p>
            </div>
          </section>

          {/* Texte d'accueil malgache */}
          <p className="mt-3 text-center text-sm md:text-xl text-foreground/60 max-w-xl mx-auto font-body animate-float-in" style={{ animationDelay: "0.05s" }}>
            Tongasoa eto amin'ny Fiangonana Chay izay mitory ny Fanjakan'Andriamanitra.
          </p>

          {/* Verset du jour (utilisateurs connectés uniquement) */}
          {!isLocalMode && isAuthenticated && (
            <div className="animate-float-in mt-6" style={{ animationDelay: "0.12s" }}>
              <VersetDuJourSection refreshKey={refreshKey} />
            </div>
          )}

          {/* Nouveautés (Préc. / Nouv.) */}
          <div className="animate-float-in mt-6" style={{ animationDelay: "0.15s" }}>
            {!isLocalMode && <NouveauteWidget />}
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

          {/* Connexion / création de compte (invités uniquement) */}
          {!isAuthenticated && <AuthButtons />}

          {/* Liens sociaux */}
          <HomeSocialLinks />
        </div>
      </div>
    </PullToRefresh>
  );
}