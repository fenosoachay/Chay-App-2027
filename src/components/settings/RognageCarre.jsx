import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadImage, renderCropToBlob } from "@/lib/imageCrop";
import {
  cadreInitial, deplacerCadre, redimensionnerCadre, sourceDuCadre, tailleAffichage,
} from "@/lib/cadreCarre";

const COINS = [
  // Dans les coins du cadre (jamais coupées par le bord de l'image), 28 px pour le doigt.
  { id: "hg", pos: "-left-0.5 -top-0.5 rounded-br-xl", curseur: "cursor-nwse-resize" },
  { id: "hd", pos: "-right-0.5 -top-0.5 rounded-bl-xl", curseur: "cursor-nesw-resize" },
  { id: "bg", pos: "-left-0.5 -bottom-0.5 rounded-tr-xl", curseur: "cursor-nesw-resize" },
  { id: "bd", pos: "-right-0.5 -bottom-0.5 rounded-tl-xl", curseur: "cursor-nwse-resize" },
];

/**
 * Photo de profil : cadre de rognage CARRÉ que le membre déplace (glisser le cadre) et redimensionne (tirer un
 * coin), au doigt comme à la souris. Seul le bouton « Rogner et enregistrer » valide : la photo envoyée est
 * toujours le carré choisi (aucune option « garder l'original »).
 */
export default function RognageCarre({ file, onCancel, onConfirm, maxW = 300, maxH = 340 }) {
  const [src, setSrc] = useState(null);
  const [image, setImage] = useState(null);
  const [taille, setTaille] = useState(null);
  const [cadre, setCadre] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const geste = useRef(null); // { type: "deplacer" | coin, x0, y0, cadre0 }

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    let actif = true;
    loadImage(url).then((im) => {
      if (!actif) return;
      const natural = { w: im.naturalWidth, h: im.naturalHeight };
      const t = tailleAffichage(natural, maxW, maxH);
      setImage(im);
      setSrc(url);
      setTaille({ ...t, natural });
      setCadre(cadreInitial(t.dispW, t.dispH));
    }).catch(() => setErreur("Cette image ne peut pas être lue. Choisissez une autre photo."));
    return () => {
      actif = false;
      URL.revokeObjectURL(url);
    };
  }, [file, maxW, maxH]);

  const debut = (type) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    geste.current = { type, x0: e.clientX, y0: e.clientY, cadre0: cadre };
  };
  const bouger = (e) => {
    const g = geste.current;
    if (!g || !taille) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    setCadre(g.type === "deplacer"
      ? deplacerCadre(g.cadre0, dx, dy, taille.dispW, taille.dispH)
      : redimensionnerCadre(g.cadre0, g.type, dx, dy, taille.dispW, taille.dispH));
  };
  const fin = () => { geste.current = null; };

  const rogner = async () => {
    if (!image || !cadre || occupe) return;
    setOccupe(true);
    try {
      const blob = await renderCropToBlob(image, sourceDuCadre(cadre, taille.dispW, taille.natural), 1);
      await onConfirm?.(blob, true);
    } catch (e) {
      setErreur(e?.message || "Rognage impossible.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/60">
        Déplacez le cadre carré et tirez un coin pour l'agrandir ou le réduire.
      </p>
      <div className="flex justify-center">
        {taille && cadre ? (
          <div
            className="relative select-none touch-none overflow-hidden rounded-xl bg-black"
            style={{ width: taille.dispW, height: taille.dispH }}
            onPointerMove={bouger}
            onPointerUp={fin}
            onPointerCancel={fin}
          >
            <img src={src} alt="" draggable={false} className="block h-full w-full" />
            <div
              role="slider"
              aria-label="Cadre de rognage carré"
              aria-valuetext={`${Math.round((cadre.c / Math.min(taille.dispW, taille.dispH)) * 100)} %`}
              tabIndex={0}
              onPointerDown={debut("deplacer")}
              className="absolute cursor-move border-2 border-white"
              style={{ left: cadre.x, top: cadre.y, width: cadre.c, height: cadre.c, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
            >
              {COINS.map((k) => (
                <span
                  key={k.id}
                  aria-label={`Redimensionner (coin ${k.id})`}
                  onPointerDown={debut(k.id)}
                  className={`absolute ${k.pos} ${k.curseur} h-7 w-7 border-2 border-white bg-primary shadow`}
                />
              ))}
            </div>
          </div>
        ) : erreur ? null : (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        )}
      </div>
      {erreur && <p className="text-sm font-semibold text-destructive">{erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted">
          Annuler
        </button>
        <button
          type="button"
          onClick={rogner}
          disabled={occupe || !cadre}
          className="flex-1 rounded-full brand-gradient text-white py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {occupe ? "Rognage…" : "Rogner et enregistrer"}
        </button>
      </div>
    </div>
  );
}
