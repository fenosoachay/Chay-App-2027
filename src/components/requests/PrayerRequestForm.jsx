import React, { useState } from "react";
import { Send, Loader2, Shield, HeartHandshake } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPrayerRequest, PRAYER_CATEGORIES } from "@/lib/requests";

const CATEGORY_ICONS = {
  "Santé": "🩺",
  "Famille": "👨‍👩‍👧",
  "Travail": "💼",
  "Guidance": "🕊️",
  "Autre": "💭",
};

export default function PrayerRequestForm({ onSubmitted }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = content.trim();

    if (!category) {
      toast({ title: "Choisis une catégorie", variant: "destructive" });
      return;
    }
    if (!value) {
      toast({ title: "Décris ton sujet de prière", variant: "destructive" });
      return;
    }
    if (value.length > 300) {
      toast({ title: "Trop long", description: "300 caractères maximum.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await createPrayerRequest({ category, content: value });
      toast({
        title: "Demande déposée sur le mur de prière",
        description: "Ta demande est anonyme. Que quelqu'un te porte en prière.",
      });
      setCategory("");
      setContent("");
      setLimitReached(false);
      onSubmitted?.();
    } catch (e) {
      if (e.message.includes("limite") || e.message.includes("atteint")) {
        setLimitReached(true);
      }
      toast({ title: "Envoi impossible", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        {/* Mention d'anonymat */}
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/20 p-3 mb-4">
          <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/70">
            <strong className="text-primary">Ta demande est anonyme.</strong>{" "}
            Les autres voient seulement le sujet et la catégorie. Aucun nom ni photo.
          </p>
        </div>

        {/* Catégorie */}
        <div className="space-y-2 mb-4">
          <Label htmlFor="prayer-category" className="text-sm font-semibold">
            Catégorie <span className="text-destructive">*</span>
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="prayer-category" className="w-full">
              <SelectValue placeholder="Choisis une catégorie…" />
            </SelectTrigger>
            <SelectContent>
              {PRAYER_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  <span className="mr-2">{CATEGORY_ICONS[cat]}</span>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sujet */}
        <div className="space-y-2">
          <Label htmlFor="prayer-content" className="text-sm font-semibold">
            Sujet de prière <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="prayer-content"
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 300))}
            rows={4}
            placeholder="Confie ce qui est sur ton cœur…"
            className="selectable resize-none"
          />
          <div className="flex justify-between items-center">
            <div className="text-[11px] text-muted-foreground">
              Maximum 3 demandes par jour
            </div>
            <div className={`text-[11px] ${content.length >= 280 ? "text-amber-500" : "text-muted-foreground"}`}>
              {content.length} / 300
            </div>
          </div>
        </div>

        {limitReached && (
          <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ Tu as atteint la limite de 3 demandes aujourd'hui. Réessaie demain.
            </p>
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={sending || limitReached}
        className="w-full sm:w-auto brand-gradient text-white border-0 hover:opacity-90"
      >
        {sending ? (
          <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Envoi…</>
        ) : (
          <><HeartHandshake className="h-4 w-4 mr-1.5" /> Déposer sur le mur de prière</>
        )}
      </Button>
    </form>
  );
}
