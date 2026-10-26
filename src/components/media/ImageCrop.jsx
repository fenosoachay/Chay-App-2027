import React, { useEffect, useRef, useState, useCallback } from "react";

export default function ImageCrop({ file, onCancel, onConfirm, aspect = 1, allowOriginal = false }) {
  // Deuxième argument de onConfirm : true si l'image a été explicitement
  // rognée, false si l'original a été conservé (permet aux appelants de
  // mémoriser le recadrage — ex. cartes d'articles). Les appelants qui
  // ignorent ce second argument voient leur comportement inchangé.
  const confirmCropped = (...args) => onConfirm?.(...args, true);
  const confirmOriginal = (...args) => onConfirm?.(...args, false);
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

  const fitScale = natural.w
    ? Math.max(VP_W / natural.w, VP_H / natural.h)
    : 1;
  const dispW = natural.w * fitScale * zoom;
  const dispH = natural.h * fitScale * zoom;
  const maxX = Math.max(0, (dispW - VP_W) / 2);
  const maxY = Math.max(0, (dispH - VP_H) / 2);
  const cx = Math.max(-maxX, Math.min(maxX, offset.x));
  const cy = Math.max(-maxY, Math.min(maxY, offset.y));

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

  const confirm = useCallback(() => {
    if (!img || !natural.w) return;
    const OUT_W = 640;
    const OUT_H = Math.round(OUT_W / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    const left0 = (VP_W - dispW) / 2 + cx;
    const top0 = (VP_H - dispH) / 2 + cy;
    const scale = fitScale * zoom;
    let sx = -left0 / scale;
    let sy = -top0 / scale;
    let sW = VP_W / scale;
    let sH = VP_H / scale;
    sx = Math.max(0, Math.min(sx, natural.w - sW));
    sy = Math.max(0, Math.min(sy, natural.h - sH));
    sW = Math.min(sW, natural.w - sx);
    sH = Math.min(sH, natural.h - sy);
    if (sW <= 0 || sH <= 0) return;
    const im = new Image();
    im.onload = () => {
      ctx.drawImage(im, sx, sy, sW, sH, 0, 0, OUT_W, OUT_H);
      canvas.toBlob((blob) => { if (blob) onConfirm?.(blob); }, "image/jpeg", 0.9);
    };
    im.src = img;
  }, [img, natural, fitScale, zoom, cx, cy, aspect, onConfirm]);

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
              left: `${(VP_W - dispW) / 2 + cx}px`,
              top: `${(VP_H - dispH) / 2 + cy}px`,
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
        <button onClick={confirmCropped} className="flex-1 rounded-full brand-gradient text-white py-2.5 text-sm font-bold">
          Rogner
        </button>
      </div>
    </div>
  );
}