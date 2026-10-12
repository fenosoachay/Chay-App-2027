import React from "react";
import { Copy, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Copie ou partage « Livre C:V texte » (partage natif si disponible).
export default function VerseCopyButton({ reference, text }) {
  const { toast } = useToast();
  const full = `${reference} ${text}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      toast({ title: "Verset copié" });
    } catch {
      toast({ title: "Copie impossible" });
    }
  };
  const share = async () => {
    try {
      await navigator.share({ text: full });
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button onClick={copy} aria-label="Copier le verset" className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
        <Copy className="h-4 w-4" />
      </button>
      {canShare && (
        <button onClick={share} aria-label="Partager le verset" className="rounded-lg p-2 text-slate-400 hover:bg-white/10">
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}