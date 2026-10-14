import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Youtube, Shield, Globe } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const RING = "inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-foreground transition-all duration-300 hover:scale-110 active:scale-95";

const LINKS = [
  { href: "http://www.chay.fr/", label: "Site Web Église Chay", ring: "border border-[#4A6CFE] shadow-[0_0_14px_rgba(74,108,254,0.55)]", icon: <Globe className="h-5 w-5" /> },
  { href: "https://www.facebook.com/www.chay.fr", label: "Facebook", ring: "border border-[#8A56E2] shadow-[0_0_14px_rgba(138,86,226,0.55)]", icon: <Facebook className="h-5 w-5" /> },
  { href: "https://www.youtube.com/@EgliseChay.fr-tv", label: "YouTube", ring: "border border-[#FF57B2] shadow-[0_0_14px_rgba(255,87,178,0.55)]", icon: <Youtube className="h-5 w-5" /> },
  {
    href: "https://www.tiktok.com/@anjahamintsoa",
    label: "TikTok",
    ring: "border border-[#F59E0B] shadow-[0_0_14px_rgba(245,158,11,0.55)]",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className="h-5 w-5">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
];

// Liens sociaux (+ accès admin) de l'accueil, encadrés de lignes lumineuses.
export default function HomeSocialLinks() {
  const { user } = useAuth();
  return (
    <footer className="mt-12 pb-6 flex items-center justify-center gap-4">
      <span className="hidden sm:block h-px w-24 bg-gradient-to-r from-transparent to-white/30" />
      <div className="flex items-center justify-center gap-4">
        {LINKS.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" aria-label={l.label} className={`${RING} ${l.ring}`}>
            {l.icon}
          </a>
        ))}
        {user?.role === "admin" && (
          <Link to="/admin" aria-label="Administration" className={`${RING} border border-white/40 shadow-[0_0_14px_rgba(255,255,255,0.3)]`}>
            <Shield className="h-5 w-5" />
          </Link>
        )}
      </div>
      <span className="hidden sm:block h-px w-24 bg-gradient-to-l from-transparent to-white/30" />
    </footer>
  );
}