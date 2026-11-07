// Recadrage d'image (composant ImageCrop) : géométrie pure + rendu sur canvas.
// Sans dépendance : utilisé par le composant et par les tests (node, et Chrome sans interface).

export const CROP_OUT_W = 640;

/**
 * Géométrie de l'aperçu et zone source à découper.
 * natural : taille réelle de l'image ; vpW/vpH : cadre visible ; zoom >= 1 ; offset : déplacement en pixels d'écran.
 * Renvoie l'affichage (dispW, dispH, left, top) et `source` ({ sx, sy, sW, sH } en pixels de l'image), ou source = null.
 */
export function cropGeometry({ natural, vpW, vpH, zoom = 1, offset = { x: 0, y: 0 } }) {
  const fitScale = natural?.w ? Math.max(vpW / natural.w, vpH / natural.h) : 1;
  const scale = fitScale * zoom;
  const dispW = (natural?.w || 0) * scale;
  const dispH = (natural?.h || 0) * scale;
  const maxX = Math.max(0, (dispW - vpW) / 2);
  const maxY = Math.max(0, (dispH - vpH) / 2);
  const cx = Math.max(-maxX, Math.min(maxX, offset.x));
  const cy = Math.max(-maxY, Math.min(maxY, offset.y));
  const left = (vpW - dispW) / 2 + cx;
  const top = (vpH - dispH) / 2 + cy;

  let source = null;
  if (natural?.w && natural?.h) {
    let sW = vpW / scale;
    let sH = vpH / scale;
    let sx = Math.max(0, Math.min(-left / scale, natural.w - sW));
    let sy = Math.max(0, Math.min(-top / scale, natural.h - sH));
    sW = Math.min(sW, natural.w - sx);
    sH = Math.min(sH, natural.h - sy);
    if (sW > 0 && sH > 0) source = { sx, sy, sW, sH };
  }
  return { fitScale, dispW, dispH, cx, cy, left, top, source };
}

/** Dessine la zone `source` de `image` sur un canvas aux proportions `aspect` et renvoie un Blob JPEG. */
export function renderCropToBlob(image, source, aspect, { doc = globalThis.document, outW = CROP_OUT_W, type = 'image/jpeg', quality = 0.9 } = {}) {
  return new Promise((resolve, reject) => {
    if (!source) { reject(new Error('Recadrage impossible : zone vide')); return; }
    const outH = Math.round(outW / aspect);
    const canvas = doc.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(image, source.sx, source.sy, source.sW, source.sH, 0, 0, outW, outH);
    canvas.toBlob((blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new Error('Recadrage impossible : image vide'))), type, quality);
  });
}

/** Charge une image depuis une adresse (blob:, data:…). */
export function loadImage(src, ImageCtor = globalThis.Image) {
  return new Promise((resolve, reject) => {
    const im = new ImageCtor();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Image illisible'));
    im.src = src;
  });
}
