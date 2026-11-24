import React from "react";
import { createPortal } from "react-dom";
import RognageCarre from "@/components/settings/RognageCarre";

/**
 * Photo d'un groupe (1.3.28) : rognée en carré avant l'envoi, comme la photo de profil (même cadre à déplacer
 * et à redimensionner). `onConfirm(blob)` reçoit l'image rognée. Fenêtre posée au-dessus du panneau « Infos »
 * (z-[60]) et de la feuille « Nouveau groupe ».
 */
export default function RognerPhotoGroupe({ file, onCancel, onConfirm, enLigne = false }) {
  if (!file) return null;
  // Dans la feuille « Nouveau groupe » (fenêtre modale qui bloque tout ce qui est hors d'elle) : dans la feuille.
  if (enLigne) {
    return (
      <div className="space-y-3 rounded-[1.25rem] border border-border bg-card p-4">
        <div className="text-center">
          <p className="font-bold">Recadrer la photo du groupe</p>
          <p className="text-sm text-muted-foreground">La photo du groupe est toujours carrée.</p>
        </div>
        <RognageCarre file={file} onCancel={onCancel} onConfirm={(blob) => onConfirm(blob)} />
      </div>
    );
  }
  // Portail sur <body> : dans la feuille « Nouveau groupe » (déplacée par transform), « fixed » serait faussé.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rogner-groupe-titre"
      className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm space-y-4 rounded-[1.5rem] border border-border bg-background p-5 shadow-xl">
        <div className="text-center">
          <h2 id="rogner-groupe-titre" className="text-lg font-bold">Recadrer la photo du groupe</h2>
          <p className="text-sm text-muted-foreground">La photo du groupe est toujours carrée.</p>
        </div>
        <RognageCarre file={file} onCancel={onCancel} onConfirm={(blob) => onConfirm(blob)} />
      </div>
    </div>,
    document.body
  );
}
