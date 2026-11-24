import React, { useEffect, useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { LayoutGrid } from "lucide-react";
import { estNatif } from "@/lib/chayConversation";
import { useToast } from "@/components/ui/use-toast";

const ChayWidget = registerPlugin("ChayWidget");

// Réglages › Affichage (1.3.25) : « Ajouter le widget à l'écran d'accueil ». Android pose lui-même le widget
// « Verset du jour » après confirmation, sans passer par la liste des widgets du téléphone (Xiaomi la masque).
export default function BoutonWidget() {
  const { toast } = useToast();
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    if (!estNatif()) return;
    ChayWidget.etat().then(setEtat).catch(() => setEtat(null));
  }, []);

  if (!estNatif() || !etat) return null;

  const ajouter = async () => {
    try {
      const r = await ChayWidget.ajouter();
      if (!r?.demande) {
        toast({ title: "Ajout impossible depuis l'app", description: "Faites un appui long sur l'écran d'accueil du téléphone, puis Widgets › Chay.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ajout impossible", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-semibold">Widget « Verset du jour »</p>
      <p className="text-xs text-foreground/50">
        Le verset du jour, toujours visible sur l'écran d'accueil du téléphone.
        {etat.pose > 0 ? " Il est déjà posé ; vous pouvez en ajouter un autre." : ""}
      </p>
      <button
        type="button"
        onClick={ajouter}
        disabled={!etat.possible}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl brand-gradient px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        <LayoutGrid className="h-4 w-4" /> Ajouter le widget à l'écran d'accueil
      </button>
      {!etat.possible && (
        <p className="text-xs text-foreground/50">Ce téléphone ne le permet pas depuis l'app : appui long sur l'écran d'accueil › Widgets › Chay.</p>
      )}
    </div>
  );
}
