import React, { useState } from "react";
import { Send, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createThemeRequest } from "@/lib/requests";

export default function ThemeRequestForm({ onSubmitted }) {
  const { toast } = useToast();
  const [theme, setTheme] = useState("");
  const [passage, setPassage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = theme.trim();

    if (!value) {
      toast({ title: "Indiquez un thème", variant: "destructive" });
      return;
    }
    if (value.length > 500) {
      toast({ title: "Le thème est trop long", description: "500 caractères maximum.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await createThemeRequest({ theme: value, passage: passage.trim() });
      toast({
        title: "Demande envoyée",
        description: "Elle sera étudiée par les responsables. Tu seras notifié de la réponse.",
      });
      setTheme("");
      setPassage("");
      onSubmitted?.();
    } catch (e) {
      toast({ title: "Envoi impossible", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <p className="text-xs md:text-sm text-foreground/60 mb-4">
          Envoyé uniquement aux admins désignés. Tu es notifié de la réponse.
        </p>

        <div className="space-y-2">
          <Label htmlFor="theme-theme" className="text-sm font-semibold">
            Thème à expliquer <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="theme-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="Ex. Le pardon dans la Bible, comment prier pour ses ennemis, la résurrection…"
            className="selectable resize-none"
          />
          <div className="flex justify-end text-[11px] text-muted-foreground">
            {theme.length} / 500
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="theme-passage" className="text-sm font-semibold flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Passage biblique (facultatif)
          </Label>
          <Input
            id="theme-passage"
            value={passage}
            onChange={(e) => setPassage(e.target.value.slice(0, 200))}
            placeholder="Ex. Matthieu 18.21-35"
            className="selectable"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={sending}
        className="w-full sm:w-auto brand-gradient text-white border-0 hover:opacity-90"
      >
        {sending ? (
          <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Envoi…</>
        ) : (
          <><Send className="h-4 w-4 mr-1.5" /> Envoyer la demande</>
        )}
      </Button>
    </form>
  );
}
