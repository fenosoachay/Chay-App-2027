import React, { useEffect, useState } from "react";
import { ChevronLeft, MessageSquareQuote, HeartHandshake } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeRequestForm from "@/components/requests/ThemeRequestForm";
import MyThemeRequests from "@/components/requests/MyThemeRequests";
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
        <TabsList className="w-full grid grid-cols-2 mb-6">
          <TabsTrigger value="theme" className="text-sm font-semibold">
            <MessageSquareQuote className="h-4 w-4 mr-1.5 inline" />
            Thème à expliquer
          </TabsTrigger>
          <TabsTrigger value="prayer" className="text-sm font-semibold" disabled>
            <HeartHandshake className="h-4 w-4 mr-1.5 inline" />
            Sujet de prière
            <span className="ml-1.5 text-[10px] text-muted-foreground">(bientôt)</span>
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="prayer">
          {/* Contenu ajouté à l'étape 5 */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
