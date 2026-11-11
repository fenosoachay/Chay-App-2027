import { useEffect } from "react";
import { motion } from "framer-motion";
import { SPLASH_EXIT_S, SPLASH_GRADIENT, SPLASH_STEPS, removeBootSplash } from "@/lib/splash";

// Écran d'affichage au lancement : nom, sigle et devise malgache (4 s, lent ; un toucher le passe).
// Pas de logo — le texte seul, en Montserrat Bold.
const MONTBOLD = "'Gilroy', 'Helvetica Neue', sans-serif";
const ease = "easeOut";

export default function SplashScreen({ onSkip }) {
  // Opaque dès la première image : le fond de démarrage d'index.html (même dégradé) peut être retiré.
  useEffect(() => { removeBootSplash(); }, []);

  const passer = () => onSkip?.();
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      passer();
    }
  };

  return (
    <motion.div
      data-chay-splash="true"
      role="button"
      tabIndex={0}
      aria-label="Passer l'animation d'accueil"
      onClick={passer}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden cursor-pointer select-none"
      // FOND DÉGRADÉ (Bleu -> Violet -> Rose), identique au lancement natif et à index.html
      style={{ background: SPLASH_GRADIENT }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: SPLASH_EXIT_S, ease: "easeInOut" }}
    >
      {/* Contenu Central */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">

        {/* 1. Nom */}
        <motion.h1
          className="text-white text-3xl md:text-4xl tracking-tight"
          style={{
            fontFamily: MONTBOLD,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textShadow: "0 0 20px rgba(255,255,255,0.4)",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPLASH_STEPS.nom, ease }}
        >
          Chay
        </motion.h1>

        {/* 2. Sigle */}
        <motion.h2
          className="text-white text-5xl md:text-6xl tracking-tight"
          style={{
            fontFamily: MONTBOLD,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            textShadow: "0 0 20px rgba(255,255,255,0.4)",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPLASH_STEPS.sigle, ease }}
        >
          EGC
        </motion.h2>

        {/* 3. Ligne Séparatrice MINIMALE */}
        <motion.div
          className="mt-3 h-[0.5px] bg-white/40"
          style={{ width: "60px" }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ ...SPLASH_STEPS.ligne, ease: "easeInOut" }}
        />

        {/* 4. Citation Malgache */}
        <motion.p
          className="mt-2 text-sm md:text-base text-white/90 italic leading-relaxed max-w-xs mx-auto"
          style={{
            fontFamily: "'Gilroy', 'Helvetica Neue', sans-serif",
            fontWeight: 400,
            letterSpacing: "0.02em",
            textShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPLASH_STEPS.citation, ease }}
        >
          Ny marina hahafaka anareo tsy ho andevo.
        </motion.p>
      </div>

      {/* Indication discrète */}
      <motion.p
        className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-0 right-0 text-center text-xs text-white/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        Touchez l'écran pour passer
      </motion.p>

      {/* Overlay Final pour vignette cinématique subtile (assombrit juste les bords extrêmes) */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_60%,rgba(0,0,0,0.3)_100%)]" />
    </motion.div>
  );
}
