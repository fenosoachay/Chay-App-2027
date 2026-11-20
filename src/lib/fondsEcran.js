// Multimédia › « Fond d'écran » (collection Wallpaper) : l'admin envoie des photos (200 Mo max chacune),
// les membres les enregistrent dans la galerie du téléphone (APK : plugin natif ChayGalerie, dossier Images/Chay ;
// navigateur : téléchargement du fichier).
import { registerPlugin } from "@capacitor/core";
import { estNatif } from "./chayConversation.js";

export const MAX_FOND_ECRAN = 200 * 1024 * 1024;
export const COTE_APERCU = 720; // grand côté des vignettes (pixels)

const ChayGalerie = registerPlugin("ChayGalerie");

/** Fonds d'écran dans l'ordre de l'admin, puis du plus récent ; sans image valide : écarté. */
export function trierFonds(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((f) => f && /^https?:\/\//.test(String(f.image_url || "")))
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999)
      || new Date(b.created_date || b.created || 0) - new Date(a.created_date || a.created || 0));
}

/** Image affichée dans la grille : la vignette si elle existe (une photo de 200 Mo ne se charge pas en liste). */
export const vignetteFond = (f) => (/^https?:\/\//.test(String(f?.thumb_url || "")) ? f.thumb_url : f?.image_url);

/** Dimensions d'une vignette (grand côté `max`, proportions gardées, jamais agrandie). */
export function dimensionsApercu(w, h, max = COTE_APERCU) {
  if (!(w > 0 && h > 0)) return null;
  const e = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * e)), h: Math.max(1, Math.round(h * e)) };
}

/** Nom de fichier proposé (titre sans accents ni caractères spéciaux). */
export function nomFichierFond(titre) {
  const s = String(titre || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "fond-ecran";
}

/**
 * Vignette JPEG d'une image choisie par l'admin (Blob), ou null si le navigateur ne peut pas la décoder
 * (image trop grande pour la mémoire, format non pris en charge) : la grille montrera alors l'image d'origine.
 */
export async function creerApercu(file, { max = COTE_APERCU, doc = globalThis.document } = {}) {
  if (!file || !String(file.type || "").startsWith("image/") || typeof createImageBitmap !== "function") return null;
  let bmp = null;
  try {
    bmp = await createImageBitmap(file);
    const d = dimensionsApercu(bmp.width, bmp.height, max);
    if (!d) return null;
    const canvas = doc.createElement("canvas");
    canvas.width = d.w;
    canvas.height = d.h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, d.w, d.h);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b || null), "image/jpeg", 0.85));
  } catch {
    return null;
  } finally {
    bmp?.close?.();
  }
}

/**
 * Enregistre le fond d'écran : APK -> galerie (Images/Chay) ; navigateur -> téléchargement.
 * Renvoie « galerie » ou « telechargement ». Lève une erreur au message lisible.
 */
export async function enregistrerFond(fond, { natif = estNatif(), plugin = ChayGalerie, fetchImpl = globalThis.fetch, doc = globalThis.document } = {}) {
  const url = String(fond?.image_url || "");
  if (!/^https?:\/\//.test(url)) throw new Error("Image indisponible.");
  const nom = nomFichierFond(fond.title);
  if (natif) {
    await plugin.enregistrerImage({ url, nom });
    return "galerie";
  }
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);
  const blob = await res.blob();
  const ext = { "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[blob.type] || "jpg";
  const lien = doc.createElement("a");
  const objet = URL.createObjectURL(blob);
  lien.href = objet;
  lien.download = `${nom}.${ext}`;
  doc.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(objet), 60_000);
  return "telechargement";
}

/** Blob -> base64 (sans le préfixe « data:… ; base64, »). */
function enBase64(blob) {
  return new Promise((ok, ko) => {
    const r = new globalThis.FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => ko(new Error("Image illisible."));
    r.readAsDataURL(blob);
  });
}

/**
 * Enregistre une image créée dans l'app (dessin colorié…) : APK -> galerie (Images/Chay) ; navigateur ->
 * téléchargement. Renvoie « galerie » ou « telechargement ».
 */
export async function enregistrerImageGalerie(blob, titre, { natif = estNatif(), plugin = ChayGalerie, doc = globalThis.document } = {}) {
  if (!blob || !blob.size) throw new Error("Image vide.");
  const nom = nomFichierFond(titre);
  if (natif) {
    await plugin.enregistrerImage({ donnees: await enBase64(blob), type: blob.type || "image/png", nom });
    return "galerie";
  }
  const ext = { "image/png": "png", "image/webp": "webp" }[blob.type] || "jpg";
  const lien = doc.createElement("a");
  const objet = URL.createObjectURL(blob);
  lien.href = objet;
  lien.download = `${nom}.${ext}`;
  doc.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(objet), 60_000);
  return "telechargement";
}
