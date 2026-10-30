import React, { useEffect, useState } from "react";
import { ChevronLeft, MessageSquareQuote, HeartHandshake, BookMarked } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeRequestForm from "@/components/requests/ThemeRequestForm";
import MyThemeRequests from "@/components/requests/MyThemeRequests";
import PrayerRequestForm from "@/components/requests/PrayerRequestForm";
import PrayerWall from "@/components/requests/PrayerWall";
import MyPrayers from "@/components/requests/MyPrayers";
import { fetchMyThemeRequests } from "@/lib/requests";

export default function Requests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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
              Propose un thème ou confie un sujet de prière.
            </p>
          </div>
        </div>
      </header>

      <Tabs defaultValue="theme" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6">
          <TabsTrigger value="theme" className="text-xs md:text-sm font-semibold">
            <MessageSquareQuote className="h-3.5 w-3.5 mr-1.5 inline" />
            Thème
          </TabsTrigger>
          <TabsTrigger value="prayer" className="text-xs md:text-sm font-semibold">
            <HeartHandshake className="h-3.5 w-3.5 mr-1.5 inline" />
            Prière
          </TabsTrigger>
          <TabsTrigger value="my-prayers" className="text-xs md:text-sm font-semibold">
            <BookMarked className="h-3.5 w-3.5 mr-1.5 inline" />
            Mes prières
          </TabsTrigger>
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

        {/* ── Onglet 3 : Mes prières ── */}
        <TabsContent value="my-prayers" className="mt-0">
          <MyPrayers key={`myprayers-${refreshKey}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
