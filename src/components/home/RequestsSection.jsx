import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Send, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL = {
  pending: "En attente",
  validated: "Validée",
  declined: "Refusée",
};

const STATUS_STYLE = {
  pending: "bg-secondary/10 text-secondary",
  validated: "bg-primary/10 text-primary",
  declined: "bg-muted text-muted-foreground",
};

// Demande de thème : le membre propose un thème à expliquer, les admins
// désignés sont notifiés (côté serveur) et le membre suit l'état de sa demande.
export default function RequestsSection({ refreshKey = 0 }) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [theme, setTheme] = useState("");
  const [passage, setPassage] = useState("");
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState([]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const rows = await base44.entities.ThemeRequest.filter(
        { user_id: user.id },
        "-created_date",
        20
      );
      setRequests(Array.isArray(rows) ? rows : []);
    } catch {
      setRequests([]);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey, user?.id]);

  const submit = async (event) => {
    event.preventDefault();
    const value = theme.trim();
    if (!value) {
      toast({ title: "Indiquez un thème", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.invoke("createThemeRequest", {
        theme: value,
        passage: passage.trim(),
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ title: "Demande envoyée", description: "Elle sera étudiée par les responsables." });
      setTheme("");
      setPassage("");
      await load();
    } catch (e) {
      toast({ title: "Envoi impossible", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <section className="mt-6">
      <div className="rounded-[1.5rem] md:rounded-[2rem] border border-border bg-card p-5 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary/10 text-primary">
            <MessageSquareQuote className="h-5 w-5" />
          </div>
          <h2 className="font-display font-extrabold text-base md:text-lg">Requêtes</h2>
        </div>

        <p className="text-xs md:text-sm text-foreground/60">
          Proposez un thème ou un passage que vous aimeriez voir expliqué.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="req-theme">Thème</Label>
            <Textarea
              id="req-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Ex. Le pardon dans la Bible…"
              className="selectable"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-passage">Passage biblique (facultatif)</Label>
            <Input
              id="req-passage"
              value={passage}
              onChange={(e) => setPassage(e.target.value.slice(0, 200))}
              placeholder="Ex. Matthieu 18.21-35"
              className="selectable"
            />
          </div>
          <Button type="submit" disabled={sending} className="w-full sm:w-auto">
            <Send className="h-4 w-4 mr-1.5" /> {sending ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </form>

        {requests.length > 0 && (
          <ul className="mt-5 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="selectable text-sm font-bold break-words">{r.theme}</p>
                    {r.passage && (
                      <p className="selectable text-xs text-foreground/60 mt-0.5">{r.passage}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[r.status] || STATUS_STYLE.pending}`}
                  >
                    {STATUS_LABEL[r.status] || STATUS_LABEL.pending}
                  </span>
                </div>
                {r.admin_note && (
                  <p className="selectable mt-2 text-xs text-foreground/70">{r.admin_note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}