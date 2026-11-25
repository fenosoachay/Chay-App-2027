import React, { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { BookOpen, ChevronRight, Info, Smartphone } from "lucide-react";
import { APP_NAME } from "@/lib/appVersion";
import AboutDialog from "@/components/home/AboutDialog";

// À propos (1.3.34) : version installée, l'Église et la mise à jour (fenêtre « À propos » de l'accueil),
// sources des textes bibliques.
function Ligne({ icone: Icone, titre, detail, onClick }) {
  const Balise = onClick ? "button" : "div";
  return (
    <Balise
      {...(onClick ? { type: "button", onClick } : {})}
      className={`flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left ${onClick ? "transition hover:border-primary" : ""}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Icone className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titre}</span>
        {detail && <span className="block text-xs text-foreground/55">{detail}</span>}
      </span>
      {onClick && <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" />}
    </Balise>
  );
}

export default function AProposSection() {
  const [installee, setInstallee] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const natif = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!natif) return;
    CapacitorApp.getInfo().then((i) => setInstallee(i?.version || null)).catch(() => {});
  }, [natif]);

  return (
    <div className="space-y-2.5">
      <Ligne
        icone={Smartphone}
        titre={natif && installee ? `${APP_NAME} · version ${installee}` : APP_NAME}
        detail={natif ? "Application Android" : "Site membres.chay.fr"}
      />
      <Ligne icone={Info} titre="L'Église et les mises à jour" detail="Présentation, partage de l'application, nouvelle version" onClick={() => setOuvert(true)} />
      <Ligne icone={BookOpen} titre="Textes bibliques" detail="Louis Segond 1910 (domaine public) · Baiboly malagasy" />
      <AboutDialog open={ouvert} onOpenChange={setOuvert} />
    </div>
  );
}
