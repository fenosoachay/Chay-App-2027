import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import WsOfflineScreen from "@/components/wordscramble/WsOfflineScreen";
import WsLevelCard from "@/components/wordscramble/WsLevelCard";
import { WS_LEVELS } from "@/lib/wordScrambleConstants";

export default function WordScramble() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!online) return;
    base44.functions.invoke("wsLevels", {}).then((r) => setData(r.data));
  }, [online]);

  if (!online) return <WsOfflineScreen />;
  if (!data) return <div className="py-24 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-8 md:py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="display-fluid">Mots <span className="brand-gradient-text">mélangés</span></h1>
        <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold">💎 {data.credits}</span>
      </div>
      <p className="mb-5 text-foreground/60">Remettez les lettres dans l'ordre pour retrouver le mot biblique. Pas de limite de temps.</p>
      <div className="grid gap-4">
        {WS_LEVELS.map((l) => (
          <WsLevelCard key={l.value} level={l} info={data.levels[l.value]} onPlay={() => navigate(`/word-scramble/play/${l.value}`)} />
        ))}
      </div>
    </div>
  );
}