import React from "react";
import { Pencil } from "lucide-react";

export default function YouTubeEditBar({ onCancel, onSave, onReset }) {
  return (
    <>
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
        <Pencil className="h-4 w-4" /> Mode édition activé
      </p>
      <div className="sticky bottom-24 z-10 mt-4 flex flex-wrap justify-center gap-2 rounded-full border border-border bg-background/90 p-2 backdrop-blur-xl animate-float-in">
        <button type="button" onClick={onCancel} className="rounded-full border border-border px-4 py-2.5 text-sm font-bold">
          Annuler
        </button>
        <button type="button" onClick={onSave} className="rounded-full brand-gradient px-4 py-2.5 text-sm font-bold text-white">
          Enregistrer
        </button>
        <button type="button" onClick={onReset} className="rounded-full border border-border px-4 py-2.5 text-sm font-bold text-foreground/70">
          Réinitialiser l'ordre
        </button>
      </div>
    </>
  );
}