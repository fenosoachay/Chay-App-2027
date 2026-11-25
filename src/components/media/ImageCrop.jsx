import React, { useEffect, useRef, useState, useCallback } from "react";
import { cropGeometry, loadImage, renderCropToBlob } from "@/lib/imageCrop";

export default function ImageCrop({ file, onCancel, onConfirm, aspect = 1, allowOriginal = false, outW }) {
  // outW : largeur de l'image rognée (640 par défaut ; plus grand pour une photo envoyée dans un message).
  // Deuxième argument de onConfirm : true si l'image a été explicitement
  // rognée, false si l'original a été conservé (permet aux appelants de
  // mémoriser le recadrage — ex. cartes d'articles). Les appelants qui
  // ignorent ce second argument voient leur comportement inchangé.
  // Ne jamais brancher confirmCropped directement sur onClick : l'appelant recevrait l'événement
  // du clic au lieu de l'image (bogue « fileSize invalide » de la photo de profil).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : relancé seulement sur ces valeurs
  const confirmCropped = (blob) => onConfirm?.(blob, true);
  const confirmOriginal = (original) => onConfirm?.(original, false);
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const vpRef = useRef(null);
  const dragging = useRef(null);

  const VP_W = 280;
  const VP_H = Math.round(VP_W / aspect);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      setNatural({ w: im.naturalWidth, h: im.naturalHeight });
      setImg(url);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const { dispW, dispH, cx, cy, left, top, source } = cropGeometry({ natural, vpW: VP_W, vpH: VP_H, zoom, offset });

  const onPointerDown = (e) => {
    dragging.current = { x: e.clientX, y: e.clientY, ox: cx, oy: cy };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    setOffset({
      x: dragging.current.ox + (e.clientX - dragging.current.x),
      y: dragging.current.oy + (e.clientY - dragging.current.y),
    });
  };
  const onPointerUp = () => { dragging.current = null; };

  // Rogner : découpe réelle sur canvas, puis onConfirm(Blob JPEG, true).
  const confirm = useCallback(async () => {
    if (!img || !source || busy) return;
    setBusy(true);
    try {
      const im = await loadImage(img);
      confirmCropped(await renderCropToBlob(im, source, aspect, outW ? { outW } : undefined));
    } catch (e) {
      console.error("[ImageCrop]", e);
    } finally {
      setBusy(false);
    }
  }, [img, source, aspect, busy, confirmCropped, outW]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={vpRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative overflow-hidden bg-black touch-none cursor-grab active:cursor-grabbing rounded-xl"
        style={{ width: VP_W, height: VP_H }}
      >
        {img && (
          <img
            src={img}
            alt=""
            draggable={false}
            className="absolute select-none"
            style={{
              width: dispW,
              height: dispH,
              left: `${left}px`,
              top: `${top}px`,
              maxWidth: "none",
            }}
          />
        )}
      </div>
      <div className="w-full max-w-xs flex items-center gap-3">
        <span className="text-xs text-foreground/55 shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="flex-1 accent-[hsl(var(--primary))]"
        />
      </div>
      <div className="flex gap-2 w-full max-w-xs">
        <button onClick={onCancel} className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted">
          Annuler
        </button>
        {allowOriginal && (
          <button onClick={() => confirmOriginal(file)} className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted">
            Conserver l'original
          </button>
        )}
        <button type="button" onClick={() => confirm()} disabled={busy || !source} className="flex-1 rounded-full brand-gradient text-white py-2.5 text-sm font-bold disabled:opacity-60">
          Rogner
        </button>
      </div>
    </div>
  );
}