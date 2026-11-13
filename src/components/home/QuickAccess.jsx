import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Radio, Baby, Gift, Info } from "lucide-react";
import AboutDialog from "./AboutDialog";

const ITEMS = [
  // /media?cat=radio ouvre directement le lecteur de radio (sinon on tombe sur la grille).
  { key: "radio", label: "Radio", icon: Radio, to: "/media?cat=radio" },
  { key: "kids", label: "Enfant", icon: Baby, to: "/kids" },
  { key: "donate", label: "Don", icon: Gift, to: "/donate" },
];

export default function QuickAccess() {
  const navigate = useNavigate();
  const [aboutOpen, setAboutOpen] = useState(false);
  // Notification « Nouvelle version » (route /?apropos=1) : « À propos » s'ouvre avec le bouton de téléchargement.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!searchParams.has("apropos")) return;
    setAboutOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("apropos");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <section className="mt-8">
      <h2 className="font-display font-extrabold text-2xl mb-4">Accès rapide</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => navigate(it.to)}
              className="flex flex-col items-center gap-2 rounded-[1.5rem] border border-border bg-card p-4 hover:border-primary hover:scale-[1.02] transition"
            >
              <span className="grid place-items-center h-12 w-12 rounded-full brand-gradient text-white">
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold">{it.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setAboutOpen(true)}
          className="flex flex-col items-center gap-2 rounded-[1.5rem] border border-border bg-card p-4 hover:border-primary hover:scale-[1.02] transition"
        >
          <span className="grid place-items-center h-12 w-12 rounded-full brand-gradient text-white">
            <Info className="h-6 w-6" />
          </span>
          <span className="text-sm font-bold">À Propos</span>
        </button>
      </div>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </section>
  );
}