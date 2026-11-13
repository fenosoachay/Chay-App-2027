import React, { useEffect, useState } from "react";
import { ChevronLeft, MessageSquareQuote, HeartHandshake, BookMarked, Compass } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeRequestForm from "@/components/requests/ThemeRequestForm";
import MyThemeRequests from "@/components/requests/MyThemeRequests";
import PrayerRequestForm from "@/components/requests/PrayerRequestForm";
import PrayerWall from "@/components/requests/PrayerWall";
import MyPrayers from "@/components/requests/MyPrayers";
import MissionForm from "@/components/requests/MissionForm";
import { fetchMyThemeRequests } from "@/lib/requests";

// Les 4 sections, en grille 2 × 2 (ordre de lecture : Thèmes, Prière / Mes prières, Se missionner).
export const SECTIONS_REQUETES = [
  { value: "theme", label: "Thèmes", desc: "Proposer un thème", icon: MessageSquareQuote, tone: "from-[#4A6CFE] to-[#8A56E2]" },
  { value: "prayer", label: "Prière", desc: "Confier un sujet", icon: HeartHandshake, tone: "from-[#FF57B2] to-[#FF4D2D]" },
  { value: "my-prayers", label: "Mes prières", desc: "Mes demandes", icon: BookMarked, tone: "from-[#2E6F40] to-[#4A6CFE]" },
  { value: "mission", label: "Se missionner", desc: "Servir avec l'église", icon: Compass, tone: "from-[#C18B33] to-[#A84D70]" },
];
const ONGLETS = SECTIONS_REQUETES.map((s) => s.value);

export default function Requests() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Onglet par défaut depuis l'URL, ou "theme"
  const urlTab = searchParams.get("tab");
  const defaultTab = ONGLETS.includes(urlTab) ? urlTab : "theme";
  const [activeTab, setActiveTab] = useState(defaultTab);
  // Notification cliquée alors que la page est déjà ouverte : l'onglet suit l'URL.
  useEffect(() => {
    if (ONGLETS.includes(urlTab)) setActiveTab(urlTab);
  }, [urlTab]);

  // Met à jour l'URL quand on change d'onglet
  const handleTabChange = (value) => {
    setActiveTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  const load = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchMyThemeRequests(user.id);
      setRequests(rows);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey, user?.id]);

  // Si l'URL change (depuis l'accueil par exemple), on change d'onglet
  useEffect(() => {
    if (urlTab && ONGLETS.includes(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleSubmitted = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-10">
      {/* Bouton retour */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-sm font-bold text-primary hover:bg-primary/10 mb-4"
      >
        <ChevronLeft className="h-5 w-5" /> Retour
      </button>

      {/* En-tête */}
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-11 w-11 rounded-2xl bg-primary/10 text-primary">
            <MessageSquareQuote className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Requêtes</h1>
            <p className="text-sm text-muted-foreground">
              Propose un thème, confie un sujet de prière ou engage-toi.
            </p>
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Grille 2 × 2 : grandes tuiles faciles à toucher ; la tuile active est entourée et légèrement relevée. */}
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-3 bg-transparent p-0">
          {SECTIONS_REQUETES.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="group flex h-auto min-h-[5.5rem] flex-col items-start justify-between gap-2 whitespace-normal rounded-[1.25rem] border-2 border-border bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/40 data-[state=active]:-translate-y-0.5 data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:shadow-md"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${s.tone} text-white shadow-sm`}>
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-extrabold leading-tight text-foreground">{s.label}</span>
                <span className="block text-xs font-medium text-muted-foreground">{s.desc}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Onglet 1 : Thème à expliquer ── */}
        <TabsContent value="theme" className="space-y-6 mt-0">
          <div>
            <h2 className="text-base font-bold mb-1">Proposer un thème</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tu aimerais qu'un thème soit expliqué ou approfondi ? Fais-le savoir ici.
            </p>
            <ThemeRequestForm onSubmitted={handleSubmitted} />
          </div>

          <div>
            <h2 className="text-base font-bold mb-3">Mes demandes</h2>
            <MyThemeRequests requests={requests} loading={loading} />
          </div>
        </TabsContent>

        {/* ── Onglet 2 : Sujet de prière ── */}
        <TabsContent value="prayer" className="space-y-8 mt-0">
          <div>
            <h2 className="text-base font-bold mb-1">Déposer une demande de prière</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Confie ce qui est sur ton cœur. Ta demande est anonyme et visible de tous.
            </p>
            <PrayerRequestForm onSubmitted={handleSubmitted} />
          </div>

          <PrayerWall key={`wall-${refreshKey}`} />
        </TabsContent>

        {/* ── Onglet 4 : Se missionner ── */}
        <TabsContent value="mission" className="mt-0">
          <div>
            <h2 className="text-base font-bold mb-1">Se missionner</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Vous souhaitez servir avec l'église ? Remplissez ce formulaire : l'équipe vous recontactera.
            </p>
            <MissionForm />
          </div>
        </TabsContent>

        {/* ── Onglet 3 : Mes prières ── */}
        <TabsContent value="my-prayers" className="mt-0">
          <MyPrayers key={`myprayers-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
