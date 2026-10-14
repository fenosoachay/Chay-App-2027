import { motion } from "framer-motion";

// Écran d'affichage au lancement : nom de l'église, sigle et devise malgache.
// Pas de logo — le texte seul, en Montserrat Bold.
const MONTBOLD = "'Gilroy', 'Helvetica Neue', sans-serif";

export default function SplashScreen() {
  return (
    <motion.div
      data-chay-splash="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      // FOND DÉGRADÉ INSPIRÉ DE L'IMAGE (Bleu -> Violet -> Rose)
      style={{
        background: "linear-gradient(135deg, #4A6CFE 0%, #8A56E2 50%, #FF57B2 100%)",
      }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {/* Contenu Central */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-2 px-8 text-center">

        {/* 1. Nom de l'église */}
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
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          Église Chay
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
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
        >
          EGC
        </motion.h2>

        {/* 3. Ligne Séparatrice MINIMALE */}
        <motion.div
          className="mt-3 h-[0.5px] bg-white/40" // Plus fine (0.5px), moins opaque (40%), largeur fixe petite
          style={{ width: "60px" }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5, ease: "easeInOut" }}
        />

        {/* 4. Citation Malgache */}
        <motion.p
          className="mt-2 text-sm md:text-base text-white/90 italic leading-relaxed max-w-xs mx-auto"
          style={{
            fontFamily: "'Gilroy', 'Helvetica Neue', sans-serif",
            fontWeight: 400,
            letterSpacing: "0.02em",
            textShadow: "0 2px 8px rgba(0,0,0,0.3)", // Ombre douce pour lisibilité
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          Ny marina hahafaka anareo tsy ho andevo.
        </motion.p>
      </div>

      {/* Overlay Final pour vignette cinématique subtile (assombrit juste les bords extrêmes) */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_60%,rgba(0,0,0,0.3)_100%)]" />
    </motion.div>
  );
}