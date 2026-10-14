import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import QuizStatCard from "@/components/admin/QuizStatCard";
import {
  Headphones,
  BookOpen,
  Bell,
  Music,
  Film,
  FileText,
  Youtube,
  HelpCircle,
  Loader2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const STATS = [
  { key: "Sermon", label: "Prédications", icon: Headphones, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  { key: "Devotional", label: "Dévotionnels", icon: BookOpen, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  { key: "Announcement", label: "Annonces", icon: Bell, tone: "from-[#FF57B2] to-[#FF4D2D]" },
  { key: "MusicTrack", label: "Musique", icon: Music, tone: "from-[#8A56E2] to-[#FF57B2]" },
  { key: "Video", label: "Vidéos", icon: Film, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  { key: "Article", label: "Articles", icon: FileText, tone: "from-[#FF4D2D] to-[#8A56E2]" },
  { key: "YouTubeVideo", label: "YouTube", icon: Youtube, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { key: "Faq", label: "FAQ", icon: HelpCircle, tone: "from-[#4A6CFE] to-[#2E6F40]" },
];

export default function DashboardHome({ onNavigate }) {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        STATS.map(async (s) => {
          const total = await base44.entities[s.key].count({}).catch(() => 0);
          return [s.key, total];
        })
      );
      setCounts(Object.fromEntries(entries));
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <div className="rounded-[2rem] brand-gradient p-8 md:p-10 text-white glow-primary relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3 mb-2">
          <Sparkles className="h-6 w-6" />
          <span className="text-xs font-bold uppercase tracking-wide bg-white/15 px-3 py-1 rounded-full">
            Tableau de bord
          </span>
        </div>
        <h2 className="relative font-display font-extrabold text-3xl md:text-4xl mt-2">
          Bienvenue, administrateur
        </h2>
        <p className="relative text-white/80 mt-2 max-w-xl">
          Gardez le contenu de CHAY frais : ajoutez, modifiez et supprimez
          prédications, dévotionnels, annonces et plus encore.
        </p>
      </div>

      <h3 className="font-display font-extrabold text-xl mt-8 mb-4">
        Aperçu du contenu
      </h3>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => onNavigate(s.key)}
                className="group text-left rounded-[1.5rem] border border-border bg-card p-5 hover:-translate-y-1 hover:shadow-lg transition-all"
              >
                <div
                  className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${s.tone} grid place-items-center text-white shadow-sm mb-3`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="font-display font-extrabold text-3xl tabular-nums">
                  {counts[s.key] ?? 0}
                </div>
                <div className="text-sm font-semibold text-foreground/55 flex items-center gap-1 mt-0.5">
                  {s.label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition" />
                </div>
              </button>
            );
          })}
          <QuizStatCard onClick={() => onNavigate("quiz")} />
        </div>
      )}
    </div>
  );
}