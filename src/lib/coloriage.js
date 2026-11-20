// Coloriage (section Enfants) : règles pures, testables hors navigateur, et « Mes dessins » (IndexedDB).
//  - masqueTraits : quels pixels sont des traits (sombres) dans le dessin ;
//  - remplir : remplit d'une couleur la zone fermée touchée (sans traverser les traits) ;
//  - Mes dessins : enregistrés sur le téléphone (IndexedDB), pour reprendre plus tard.

export const COTE = 800; // taille du dessin (pixels), carré

export const PALETTE = [
  "#E53935", "#FF7043", "#FFB300", "#FDD835", "#C0CA33", "#7CB342", "#2E7D32", "#26A69A",
  "#29B6F6", "#1E88E5", "#3949AB", "#8E24AA", "#D81B60", "#F48FB1", "#FFCC80", "#A1887F",
  "#6D4C41", "#9E9E9E", "#424242", "#FFFFFF",
];

/** Masque des traits : 1 = pixel de trait (sombre et opaque), 0 = zone coloriable. `rgba` : données d'image. */
export function masqueTraits(rgba, seuil = 150) {
  const n = rgba.length / 4;
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    m[i] = a > 128 && lum < seuil ? 1 : 0;
  }
  return m;
}

/** "#RRGGBB" -> [r, g, b]. */
export function rgb(hex) {
  const h = String(hex || "#000000").replace("#", "");
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

/**
 * Remplit la zone touchée (x, y) dans `couleurs` (données RGBA de la couche de couleurs, largeur w, hauteur h),
 * en s'arrêtant aux traits du `masque`. Les pixels de trait qui bordent la zone sont aussi colorés (1 pixel),
 * pour ne pas laisser de liseré blanc le long des traits (les traits restent dessinés par-dessus).
 * Renvoie le nombre de pixels coloriés (0 si on a touché un trait).
 */
export function remplir(masque, couleurs, w, h, x, y, hex) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const depart = y * w + x;
  if (masque[depart]) return 0;
  const [r, g, b] = rgb(hex);
  const vu = new Uint8Array(w * h);
  const pile = [depart];
  vu[depart] = 1;
  let n = 0;
  const peindre = (i) => {
    couleurs[i * 4] = r;
    couleurs[i * 4 + 1] = g;
    couleurs[i * 4 + 2] = b;
    couleurs[i * 4 + 3] = 255;
  };
  while (pile.length) {
    const i = pile.pop();
    peindre(i);
    n += 1;
    const px = i % w;
    const voisins = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const v of voisins) {
      if (v < 0 || v >= w * h || vu[v]) continue;
      vu[v] = 1;
      if (masque[v]) peindre(v); // bord du trait : coloré, mais on ne traverse pas
      else pile.push(v);
    }
  }
  return n;
}

/** Position dans le dessin (pixels du canvas) d'un point de l'écran, d'après le rectangle affiché. */
export function versDessin(clientX, clientY, rect, cote = COTE) {
  return {
    x: ((clientX - rect.left) / rect.width) * cote,
    y: ((clientY - rect.top) / rect.height) * cote,
  };
}

/* ─── Mes dessins (IndexedDB, sur ce téléphone) ─────────────────────────────── */
const BASE = "chay-coloriage";
const TABLE = "dessins";

function ouvrir() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === "undefined") { ko(new Error("Stockage indisponible")); return; }
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(TABLE)) req.result.createObjectStore(TABLE, { keyPath: "id" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error || new Error("Stockage indisponible"));
  });
}

async function operation(mode, action) {
  const db = await ouvrir();
  try {
    return await new Promise((ok, ko) => {
      const tx = db.transaction(TABLE, mode);
      const req = action(tx.objectStore(TABLE));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => ko(tx.error);
      tx.onabort = () => ko(tx.error);
    });
  } finally {
    db.close();
  }
}

/** { id, source, titre, apercu (Blob PNG du dessin colorié), couleurs (Blob PNG de la couche de couleurs), date }. */
export const enregistrerDessin = (d) => operation("readwrite", (t) => t.put(d));
export const supprimerDessin = (id) => operation("readwrite", (t) => t.delete(id));
export async function listerDessins() {
  const tous = await operation("readonly", (t) => t.getAll());
  return (tous || []).sort((a, b) => (b.date || 0) - (a.date || 0));
}
