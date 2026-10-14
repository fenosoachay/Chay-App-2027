import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, WifiOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import useWordScrambleGame from "@/hooks/useWordScrambleGame";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import WsOfflineScreen from "@/components/wordscramble/WsOfflineScreen";
import WsTile from "@/components/wordscramble/WsTile";
import WsAnswerRow from "@/components/wordscramble/WsAnswerRow";
import WsActions from "@/components/wordscramble/WsActions";
import WsPhraseHint from "@/components/wordscramble/WsPhraseHint";
import { useToast } from "@/components/ui/use-toast";
import { wsLevelOf } from "@/lib/wordScrambleConstants";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function PlayView({ difficulty }) {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { toast } = useToast();
  const g = useWordScrambleGame(difficulty);
  const level = wsLevelOf(difficulty);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (g.status === "finished") navigate("/word-scramble/results", { replace: true, state: { summary: g.summary } });
  }, [g.status, g.summary, navigate]);

  if (!online && g.status === "loading") return <WsOfflineScreen />;
  if (g.status === "loading") return <div className="py-24 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /></div>;
  if (g.status === "error") {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="text-foreground/70">{g.error}</p>
        <button onClick={() => navigate("/word-scramble")} className="mt-5 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Retour au menu</button>
      </div>
    );
  }
  if (g.status === "finished") return null;

  // « Retour » abandonne la partie : on la termine côté serveur (mots restants = 0 pt).
  const abandon = async () => {
    setLeaving(true);
    const res = await base44.functions.invoke("wsFinish", { session_id: g.session.session_id, difficulty });
    navigate("/word-scramble/results", { replace: true, state: { summary: res.data, abandoned: true } });
  };

  const onHint = async (type) => {
    const r = await g.buyHint(type);
    if (r.error && r.error !== "busy") toast({ title: r.error, variant: "destructive" });
  };

  const locked = g.feedback === "correct" || g.busy || leaving;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-8 py-6 md:py-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={abandon} disabled={leaving} className="text-sm font-bold text-foreground/60 hover:text-foreground">← Retour</button>
        <span className="text-sm font-bold text-foreground/70">Mot {g.index + 1} sur {g.total}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold">🏆 {g.score} pts</span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold">💎 {g.credits}</span>
        </div>
      </div>

      <div key={g.word.wordId} className="animate-float-in rounded-[2rem] border border-border bg-card p-6 md:p-8">
        {level && <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${level.badge}`}>{level.emoji} {level.label}</span>}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {g.pool.map((t) => <WsTile key={t.id} char={t.char} disabled={locked} onClick={() => g.place(t)} />)}
          {g.pool.length === 0 && <div className="h-12 sm:h-14" />}
        </div>

        <div className="my-6 h-px bg-border" />

        <WsAnswerRow length={g.word.wordLength} placed={g.placed} lockedId={g.lockedFirst?.id} feedback={g.feedback} onRemove={g.unplace} />

        <div className="mt-4 h-6 text-center text-sm font-bold">
          {g.feedback === "wrong" && <span className="text-red-500">Réessayez</span>}
          {g.feedback === "correct" && <span className="text-green-500">✅ Correct ! +{g.lastGain} pts</span>}
        </div>

        <div className="mt-4"><WsActions disabled={locked} credits={g.credits} onShuffle={g.shufflePool} onErase={g.erase} onHint={onHint} /></div>
        {g.phrase && <div className="mt-5"><WsPhraseHint phrase={g.phrase} /></div>}
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full brand-gradient transition-all duration-500" style={{ width: `${((g.index + (g.feedback === "correct" ? 1 : 0)) / g.total) * 100}%` }} />
      </div>

      <AlertDialog open={!online}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><WifiOff className="h-5 w-5 text-destructive" /> Connexion perdue</AlertDialogTitle>
            <AlertDialogDescription>La partie est annulée.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogAction onClick={() => navigate("/word-scramble")}>Retour au menu</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function WordScramblePlay() {
  const { difficulty } = useParams();
  const navigate = useNavigate();
  const valid = Boolean(wsLevelOf(difficulty));
  useEffect(() => { if (!valid) navigate("/word-scramble", { replace: true }); }, [valid, navigate]);
  if (!valid) return null;
  return <PlayView key={difficulty} difficulty={difficulty} />;
}