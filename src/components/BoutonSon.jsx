import React, { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { jouerSon, reglerSons, sonsActifs } from "@/lib/sonsJeu";

/** Bouton son des jeux (1.3.30) : un seul réglage pour tous les jeux, gardé sur l'appareil. */
export default function BoutonSon({ className = "" }) {
  const [actif, setActif] = useState(sonsActifs);
  return (
    <button
      type="button"
      onClick={() => { reglerSons(!actif); setActif(!actif); if (!actif) jouerSon("clic"); }}
      aria-label={actif ? "Couper le son des jeux" : "Remettre le son des jeux"}
      aria-pressed={!actif}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted ${className}`}
    >
      {actif ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}
