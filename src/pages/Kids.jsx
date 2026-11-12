import React from "react";
import { Baby, BookOpen, Gamepad2, Film, Palette } from "lucide-react";
import ColoringBook from "@/components/kids/ColoringBook";

const ZONES = [
  { id: "learn", label: "Apprendre la Bible", desc: "Leçons & quiz", icon: BookOpen, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  { id: "games", label: "Jeux pour enfants", desc: "Noé, David & plus", icon: Gamepad2, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  { id: "cartoons", label: "Dessins animés", desc: "Sûr & officiel", icon: Film, tone: "from-[#FF57B2] to-[#FF4D2D]" },
  { id: "create", label: "Créativité", desc: "Colorier & créer", icon: Palette, tone: "from-[#FF4D2D] to-[#8A56E2]" },
];

export default function Kids() {
  return (
    <div className="mx-auto max-w-6xl px-6 md:px-8 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="display-fluid"><span className="brand-gradient-text">CHAY</span> Enfants</h1>
        <p className="mt-3 text-lg text-foreground/60">Un espace sûr et joyeux pour apprendre à connaître Dieu.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
        {ZONES.map((z) => {
          const Icon = z.icon;
          return (
            <div key={z.id} className="group rounded-[1.5rem] border border-border bg-card p-6 hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${z.tone} grid place-items-center text-white shadow-sm mb-4`}>
                <Icon className="h-7 w-7" />
              </div>
              <div className="font-display font-bold text-lg">{z.label}</div>
              <div className="text-sm text-foreground/55">{z.desc}</div>
            </div>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="font-display font-extrabold text-2xl mb-4">Colorier</h2>
        <ColoringBook />
      </section>

      <div className="mt-8 rounded-[2rem] brand-gradient p-8 md:p-10 text-white flex items-center gap-5 glow-primary">
        <Baby className="h-12 w-12 shrink-0" />
        <div>
          <div className="font-display font-bold text-xl">L'histoire du jour : L'arche de Noé</div>
          <p className="text-white/80 text-sm mt-1">Touchez pour commencer l'aventure — gagnez des points en chemin !</p>
        </div>
      </div>
    </div>
  );
}