import React, { useEffect, useState } from "react";
import { Crop, Loader2, RotateCw, Send, X } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import ImageCrop from "@/components/media/ImageCrop";

// Avant d'envoyer une photo dans un message : aperçu, pivoter (quart de tour), recadrer (carré, 4:3, 3:4, 16:9),
// puis « Envoyer ». La photo envoyée est celle de l'aperçu.
const FORMATS = [
  { id: "carre", label: "Carré", aspect: 1 },
  { id: "4-3", label: "4:3", aspect: 4 / 3 },
  { id: "3-4", label: "3:4", aspect: 3 / 4 },
  { id: "16-9", label: "16:9", aspect: 16 / 9 },
];
const COTE_MAX = 2560; // taille maximale envoyée (côté le plus long)

/** Image tournée d'un quart de tour vers la droite (Blob JPEG). */
function pivoter(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => {
      const r = Math.min(1, COTE_MAX / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.round(im.naturalWidth * r);
      const h = Math.round(im.naturalHeight * r);
      const c = document.createElement("canvas");
      c.width = h;
      c.height = w;
      const ctx = c.getContext("2d");
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Rotation impossible"))), "image/jpeg", 0.92);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible")); };
    im.src = url;
  });
}

export default function PhotoEditeur({ fichier, onAnnuler, onEnvoyer }) {
  const [photo, setPhoto] = useState(fichier);
  const [apercu, setApercu] = useState("");
  const [format, setFormat] = useState(null); // recadrage en cours
  const [occupe, setOccupe] = useState(false);

  useBackHandler(true, () => (format ? setFormat(null) : onAnnuler()));

  useEffect(() => {
    const url = URL.createObjectURL(photo);
    setApercu(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const tourner = async () => {
    setOccupe(true);
    try { setPhoto(await pivoter(photo)); } catch { /* photo inchangée */ }
    setOccupe(false);
  };

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-black text-white" style={{ paddingTop: "var(--sa-top)", paddingBottom: "var(--sa-bottom)" }}>
      <div className="flex items-center justify-between px-3 py-2">
        <button type="button" onClick={onAnnuler} aria-label="Annuler" className="grid h-11 w-11 place-items-center rounded-full bg-white/10">
          <X className="h-6 w-6" />
        </button>
        <span className="font-display text-lg font-bold">{format ? "Recadrer" : "Modifier la photo"}</span>
        <span className="h-11 w-11" />
      </div>

      {format ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 text-foreground">
          <div className="flex flex-wrap justify-center gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${format.id === f.id ? "bg-white text-black" : "bg-white/15 text-white"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-card p-4">
            <ImageCrop
              key={format.id}
              file={photo}
              aspect={format.aspect}
              outW={1440}
              onCancel={() => setFormat(null)}
              onConfirm={(blob) => { setPhoto(blob); setFormat(null); }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {apercu && <img src={apercu} alt="Photo à envoyer" className="max-h-full max-w-full rounded-lg object-contain" />}
          </div>
          <div className="flex items-center justify-around gap-2 px-4 py-3">
            <button type="button" onClick={tourner} disabled={occupe} className="flex flex-col items-center gap-1 text-xs font-bold disabled:opacity-50">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15">
                {occupe ? <Loader2 className="h-6 w-6 animate-spin" /> : <RotateCw className="h-6 w-6" />}
              </span>
              Pivoter
            </button>
            <button type="button" onClick={() => setFormat(FORMATS[0])} disabled={occupe} className="flex flex-col items-center gap-1 text-xs font-bold disabled:opacity-50">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15"><Crop className="h-6 w-6" /></span>
              Recadrer
            </button>
            <button type="button" onClick={() => onEnvoyer(photo)} disabled={occupe} className="flex flex-col items-center gap-1 text-xs font-bold disabled:opacity-50">
              <span className="grid h-12 w-12 place-items-center rounded-full brand-gradient"><Send className="h-6 w-6" /></span>
              Envoyer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
