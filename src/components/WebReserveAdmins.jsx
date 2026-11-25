import React from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { motion } from "framer-motion";
import { Download, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { APK_URL } from "@/lib/apkRelease";
import { webFerme } from "@/lib/webReserve";
import { Etincelles, Reflet } from "@/components/jeux/BarreJeux";

// 1.3.35 : sur le web, l'appli est réservée aux admins. Les membres (et les visiteurs) reçoivent le lien de
// l'application Android. Habillage « Nuit dorée ».

const ETAPES = [
  "Touchez « Télécharger l'application ».",
  "Ouvrez le fichier chay.apk reçu, puis « Installer » (autorisez l'installation si Android le demande).",
  "Connectez-vous avec la même adresse e-mail et le même mot de passe.",
];

export function PageTelechargerApp() {
  const { user, logout } = useAuth();
  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10 text-white"
      style={{ background: "radial-gradient(120% 60% at 50% 100%, #c98a2e 0%, #5b2f63 40%, transparent 70%), linear-gradient(180deg, #0C0E2C, #1E1448 60%, #3a1f3f)" }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true"><Etincelles n={22} graine={3} /></div>
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-[#C9A052]/45 bg-[#0C0E2C]/70 p-6 text-center shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm"
      >
        <Reflet duree={6} />
        <motion.img
          src="/branding/icon-192.png"
          alt=""
          className="relative mx-auto h-20 w-20 rounded-[1.4rem] shadow-[0_0_40px_rgba(255,214,110,0.35)]"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <h1 className="relative mt-5 font-display text-2xl font-extrabold tracking-wide text-[#F3E2B5]">Chay est dans l'application</h1>
        <p className="relative mt-2 text-sm leading-relaxed text-white/70">
          {user ? `Bonjour ${user.first_name || ""} ! ` : ""}L'Église Chay se vit désormais dans l'application Android : messages, Bible, musique, jeux et notifications.
        </p>
        <a
          href={APK_URL}
          className="relative mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FFD66E] to-[#C9A052] px-5 py-3.5 font-bold text-[#1a1033] shadow-[0_10px_30px_-10px_rgba(255,214,110,0.7)] transition active:scale-[0.98]"
        >
          <Download className="h-5 w-5" /> Télécharger l'application
        </a>
        <ol className="relative mt-6 space-y-2.5 text-left">
          {ETAPES.map((t, i) => (
            <motion.li
              key={t}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.1 }}
              className="flex gap-3 rounded-2xl border border-[#C9A052]/20 bg-white/[0.04] p-3 text-sm text-white/80"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FFD66E]/15 text-xs font-bold text-[#FFD66E]">{i + 1}</span>
              {t}
            </motion.li>
          ))}
        </ol>
        <p className="relative mt-5 flex items-center justify-center gap-1.5 text-xs text-white/45">
          <Smartphone className="h-3.5 w-3.5" /> Android seulement pour le moment.
        </p>
        <div className="relative mt-5 border-t border-white/10 pt-4">
          {user ? (
            <button type="button" onClick={() => logout()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F3E2B5]/80 hover:text-[#F3E2B5]">
              <LogOut className="h-4 w-4" /> Se déconnecter
            </button>
          ) : (
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F3E2B5]/80 hover:text-[#F3E2B5]">
              <ShieldCheck className="h-4 w-4" /> Connexion administrateur
            </Link>
          )}
        </div>
      </motion.section>
    </main>
  );
}

/** Garde : sur le web, seuls les admins passent ; les autres voient la page de téléchargement. */
export default function WebReserveAdmins({ children }) {
  const { user } = useAuth();
  if (webFerme({ natif: Capacitor.isNativePlatform(), user })) return <PageTelechargerApp />;
  return children;
}
