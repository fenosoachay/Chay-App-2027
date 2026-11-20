import React, { useState } from "react";
import { ArrowLeft, Grid3x3, Palette } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import Coloriage from "@/components/kids/Coloriage";
import Memory from "@/components/kids/Memory";

// Section Enfants : accueil avec de grandes cases ; chaque case ouvre son activité (retour = accueil Enfants).
const ACTIVITES = [
  { id: "coloriage", titre: "Coloriage", desc: "Colorie les histoires de la Bible", icon: Palette, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "memory", titre: "Memory", desc: "Retrouve les paires et apprends la Bible", icon: Grid3x3, tone: "from-[#4A6CFE] to-[#8A56E2]" },
];

export default function Kids() {
  const [activite, setActivite] = useState(null);
  useBackHandler(Boolean(activite), () => setActivite(null));
  const courante = ACTIVITES.find((a) => a.id === activite);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-12">
      {courante ? (
        <>
          <header className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Retour"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-display text-3xl font-extrabold">{courante.titre}</h1>
          </header>
          {activite === "coloriage" && <Coloriage />}
          {activite === "memory" && <Memory />}
        </>
      ) : (
        <>
          <header className="mb-8">
            <h1 className="display-fluid"><span className="brand-gradient-text">CHAY</span> Enfants</h1>
            <p className="mt-3 text-lg text-foreground/60">Un espace sûr et joyeux pour apprendre à connaître Dieu.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 md:gap-5">
            {ACTIVITES.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActivite(a.id)}
                  className={`flex items-center gap-4 rounded-[1.75rem] bg-gradient-to-br ${a.tone} p-6 text-left text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl`}
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20">
                    <Icon className="h-9 w-9" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-2xl font-extrabold">{a.titre}</span>
                    <span className="block text-sm text-white/85">{a.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
