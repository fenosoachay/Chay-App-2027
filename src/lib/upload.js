import { base44 } from "@/api/base44Client";
import { IS_POCKETBASE } from "@/api/backendConfig";
import { appParams } from "@/lib/app-params";

const SERVER_BASE = appParams.appBaseUrl || "https://base44.app";
// Mode PocketBase : mêmes fonctions, servies par les routes POST /api/fn/<nom> du serveur PocketBase
// (pocketbase/pb_hooks/fichiers.pb.js), avec le jeton PocketBase. Mode Base44 : inchangé.
const fnUrl = (name) => (IS_POCKETBASE
  ? `${base44.config?.serverUrl}/api/fn/${name}`
  : `${SERVER_BASE}/api/functions/${name}`);
export const REMOTE_APP_URL = "https://chay.base44.app";

export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 Mo
export const SEUIL_UPLOAD_DIRECT = 15 * 1024 * 1024; // 15 Mo
export const SEUIL_MULTIPART_S3 = 100 * 1024 * 1024; // 100 Mo
const MO = 1024 * 1024;
// Plafonds (mode PocketBase), identiques au serveur (pb_hooks/lib/televersement.js) : au-delà de 100 Mo, l'audio et
// les images vont sur R2 comme les vidéos. Avant la 1.3.6, un mp3 de plus de 100 Mo y recevait 415 (vidéos seulement).
export const MAX_AUDIO = 1024 * MO; // 1 Go
export const MAX_IMAGE = 200 * MO; // 200 Mo
export const MAX_VIDEO = 5 * 1024 * MO; // 5 Go
const AUDIO_EXT = ["mp3", "m4a", "m4b", "aac", "wav", "ogg", "oga", "opus", "flac", "wma", "amr", "aiff", "aif", "3ga", "mka", "weba", "ac3", "mp2", "caf"];
const IMAGE_EXT = ["jpg", "jpeg", "jfif", "png", "webp", "gif", "heic", "heif", "avif", "bmp", "tif", "tiff"];
const extOf = (file) => ((/\.([a-z0-9]{1,5})$/i.exec(String(file?.name || "")) || [])[1] || "").toLowerCase();

/** Famille d'un fichier (« video », « audio », « image » ou null), d'après son type puis son extension. */
export function familleFichier(file) {
  if (isVideoFile(file)) return "video";
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("audio/") || AUDIO_EXT.includes(extOf(file))) return "audio";
  if (type.startsWith("image/") || IMAGE_EXT.includes(extOf(file))) return "image";
  return null;
}

/**
 * Message d'erreur si le fichier dépasse le plafond de sa famille (refus AVANT tout envoi), sinon null.
 * Au-delà de 100 Mo, seuls l'audio, les images et les vidéos sont acceptés.
 */
export function refusTaille(file) {
  const famille = familleFichier(file);
  const max = { video: [MAX_VIDEO, "5 Go"], audio: [MAX_AUDIO, "1 Go"], image: [MAX_IMAGE, "200 Mo"] }[famille];
  if (max && file.size > max[0]) return `Fichier trop volumineux (max ${max[1]} pour ${famille === "video" ? "une vidéo" : famille === "audio" ? "un fichier audio" : "une image"}).`;
  if (!max && file.size > SEUIL_MULTIPART_S3) return "Fichier trop volumineux (max 100 Mo pour ce type de fichier).";
  return null;
}

// Le serveur reconnaît la famille à l'extension : un fichier audio ou image sans extension connue en reçoit une.
const EXT_PAR_TYPE = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/avif": "avif", "audio/x-ms-wma": "wma", "audio/amr": "amr", "audio/aiff": "aiff", "audio/x-aiff": "aiff", "audio/3gpp": "3ga", "audio/webm": "weba", "image/bmp": "bmp", "image/tiff": "tiff" };
function avecExtension(file, famille) {
  const connues = famille === "audio" ? AUDIO_EXT : IMAGE_EXT;
  if (connues.includes(extOf(file))) return file;
  const ext = EXT_PAR_TYPE[String(file?.type || "").toLowerCase()] || (famille === "audio" ? "mp3" : "jpg");
  return new File([file], `${famille === "audio" ? "audio" : "image"}.${ext}`, { type: file.type || "", lastModified: file.lastModified || Date.now() });
}
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Identifiant de session (reprise) : base64 de « nom:taille:date ». btoa() seul échoue sur un nom hors Latin-1
// (tiret long, emoji, malgache…) : on encode d'abord en UTF-8.
export function sessionIdOf(file) {
  const bytes = new TextEncoder().encode(`${file.name}:${file.size}:${file.lastModified}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
}

// Politique (mode PocketBase) : TOUTES les vidéos vont sur R2, quelle que soit leur taille ; PocketBase ne garde
// que les images, l'audio et les petits documents (sauvegardes petites). Mêmes extensions que le serveur.
export const VIDEO_EXT = ["mp4", "m4v", "mov", "webm", "mkv", "3gp", "3g2", "avi", "wmv", "asf", "flv", "mpeg", "mpg", "ts", "mts", "m2ts"];
const VIDEO_EXT_BY_TYPE = { "video/mp4": "mp4", "video/x-m4v": "m4v", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv", "video/3gpp": "3gp", "video/3gpp2": "3g2", "video/x-msvideo": "avi", "video/avi": "avi", "video/x-ms-wmv": "wmv", "video/x-ms-asf": "asf", "video/x-flv": "flv", "video/mpeg": "mpeg", "video/mp2t": "ts" };
export function isVideoFile(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(String(file?.name || "")) || [])[1];
  return Boolean(ext) && VIDEO_EXT.includes(ext.toLowerCase());
}
// Le serveur exige une extension vidéo dans le nom : un Blob sans nom (ou mal nommé) reçoit « video.<ext> ».
function withVideoName(file) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(String(file?.name || "")) || [])[1]?.toLowerCase();
  if (ext && VIDEO_EXT.includes(ext)) return file;
  const fallback = VIDEO_EXT_BY_TYPE[String(file?.type || "").toLowerCase()] || "mp4";
  return new File([file], `video.${fallback}`, { type: file.type || "video/mp4", lastModified: file.lastModified || Date.now() });
}

const pickUrl = (res) => {
  if (!res) return null;
  if (typeof res === "string") return /^https?:\/\//i.test(res) ? res : null;
  const url = res.file_url || res.url || res.uri || res.data?.file_url || res.data?.url || null;
  return url && /^https?:\/\//i.test(url) ? url : null;
};

function authHeaders(extra = {}) {
  if (IS_POCKETBASE) {
    const token = base44.config?.token;
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }
  const token = appParams.token || base44.config?.token;
  return {
    "X-App-Id": String(appParams.appId ?? ""),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function directUpload(file) {
  const res = await base44.integrations.Core.UploadFile({ file });
  const url = pickUrl(res);
  if (!url) throw new Error("Échec du téléversement : réponse inattendue");
  return url;
}

async function postWithRetry(url, body, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    try {
      const elapsed = Math.min(30_000, 500 * 2 ** attempt) * attempt;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (opts.timeoutMs ?? 120_000) + elapsed);
      const onOuterAbort = () => controller.abort();
      opts.signal?.addEventListener("abort", onOuterAbort);
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: authHeaders(opts.headers || {}),
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onOuterAbort);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
      const networkLevel = !err.retryable && !(err.name === "AbortError" && attempt > 0);
      if (attempt === MAX_RETRIES) break;
      if (!err.retryable && !networkLevel && err.message?.startsWith("HTTP 4")) break;
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = n, u = 0;
  // 1.3.40 : unités décimales (1 Mo = 1 000 000 octets), comme Android.
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u += 1; }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

const MAX_PARTS = 10_000;

async function callFn(name, payload, { signal, timeoutMs = 60_000 } = {}) {
  const res = await postWithRetry(fnUrl(name), JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    signal,
    timeoutMs,
  });
  if (res?.error) throw new Error(res.error);
  return res || {};
}

async function putPartToS3(presignedUrl, blob, { signal, partNumber }) {
  console.log(`[S3-PUT] Tentative d'envoi du morceau ${partNumber} vers R2...`);
  
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    try {
      const controller = new AbortController();
      const ms = Math.min(600_000, Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 60_000));
      const timer = setTimeout(() => controller.abort(), ms);
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener("abort", onOuterAbort);
      let res;
      try {
        res = await fetch(presignedUrl, {
          method: "PUT",
          body: blob,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
      }
      
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[S3-PUT] Échec HTTP ${res.status} pour le morceau ${partNumber}:`, text);
        const err = new Error(`S3 HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.retryable = res.status >= 500 || res.status === 429;
        throw err;
      }
      
      const etag = res.headers.get("etag") || res.headers.get("x-etag") || "";
      if (!etag) {
        console.error(`[S3-PUT] ETag manquant dans la réponse pour le morceau ${partNumber}. Vérifiez le CORS R2 (ExposeHeaders: ETag)`);
        throw new Error("ETag absent de la réponse S3. Vérifiez la configuration CORS du bucket R2.");
      }
      
      console.log(`[S3-PUT] Succès pour le morceau ${partNumber}. ETag:`, etag);
      return etag.replace(/"/g, "");
    } catch (err) {
      lastErr = err;
      console.error(`[S3-PUT] Erreur capturée pour le morceau ${partNumber} (tentative ${attempt}):`, err.message);
      if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
      if (attempt === MAX_RETRIES) break;
      if (err.retryable === false && !/^S3 HTTP 403/.test(err.message || "")) {
        if (/HTTP 4(00|11|13|14)/.test(err.message || "")) break;
      }
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

export async function uploadMultipartS3(file, cb = {}) {
  const { onProgress, onDetail, signal, initExtra, usage } = cb;
  // 1.3.35 : « usage: "message" » (pièces jointes des membres) accompagne les trois appels.
  const extra = usage ? { usage } : {};
  console.log("[S3] Démarrage de uploadMultipartS3 pour:", file.name, "Taille:", file.size);

  const sessionId = sessionIdOf(file);

  console.log("[S3] Étape 1: Appel à initMultipartUpload...");
  const init = await callFn("initMultipartUpload", {
    session_id: sessionId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "",
    lastModified: file.lastModified || 0,
    ...(initExtra || {}),
    ...extra,
  }, { signal });
  
  console.log("[S3] Réponse de initMultipartUpload:", init);
  
  if (init.already_done && init.file_url) { 
    onProgress?.(100); 
    return init.file_url; 
  }
  
  const { uploadId, key } = init;
  if (!uploadId || !key) throw new Error("initMultipartUpload : uploadId ou key absents dans la réponse");
  
  const partSize = Math.max(Number(init.partSize) || CHUNK_SIZE, 5 * 1024 * 1024);
  const totalParts = Number(init.totalParts) || Math.ceil(file.size / partSize);
  
  console.log(`[S3] Découpage en ${totalParts} morceaux de ${partSize} octets.`);
  
  if (totalParts > MAX_PARTS) throw new Error(`Trop de parts (${totalParts})`);

  let doneSet = new Set();
  try {
    const st = await callFn("getPresignedUrl", { action: "status", session_id: sessionId, ...extra }, { signal });
    if (st.done && st.file_url) { onProgress?.(100); return st.file_url; }
    for (const n of st.uploaded || []) doneSet.add(Number(n));
  } catch (e) {
    console.log("[S3] Aucune session précédente trouvée, on commence à zéro.");
  }

  let uploadedBytes = 0;
  for (const i of doneSet) {
    const start = (i - 1) * partSize;
    uploadedBytes += Math.min(partSize, file.size - start);
  }
  
  const report = () => {
    onProgress?.(Math.min(93, Math.round((uploadedBytes / file.size) * 93)));
    onDetail?.({ uploadedBytes, totalBytes: file.size });
  };
  report();

  const parts = [];
  console.log(`[S3] Étape 3: Boucle d'envoi des ${totalParts} morceaux...`);
  
  for (let n = 1; n <= totalParts; n++) {
    if (doneSet.has(n)) {
      console.log(`[S3] Morceau ${n} déjà envoyé, on skip.`);
      continue;
    }
    if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    
    const start = (n - 1) * partSize;
    const blob = file.slice(start, Math.min(file.size, start + partSize));

    console.log(`[S3] Morceau ${n}/${totalParts}: Demande de presigned URL...`);
    const signed = await callFn("getPresignedUrl", { 
      session_id: sessionId, 
      uploadId, 
      key, 
      partNumber: n,
      ...extra,
    }, { signal });
    
    if (!signed || !signed.presignedUrl) {
      console.error("[S3] Erreur: presignedUrl est vide ou undefined!", signed);
      throw new Error("Le serveur n'a pas renvoyé de presignedUrl valide.");
    }

    try {
      const etag = await putPartToS3(signed.presignedUrl, blob, { signal, partNumber: n });
      parts.push({ partNumber: n, etag });
      uploadedBytes += blob.size;
      report();
      
      // ✅ LE BLOC "register" A ÉTÉ SUPPRIMÉ ICI. 
      // On ne stocke plus les ETags dans la base de données Base44.
      
    } catch (err) {
      console.error(`[S3] ÉCHEC CRITIQUE au morceau ${n}. L'upload s'arrête ici.`, err);
      throw err;
    }
  }

  console.log("[S3] Étape 4: Tous les morceaux envoyés. Appel à completeMultipartUpload...");
  console.log("[S3] Parts à assembler:", parts);
  
  onProgress?.(95);
  const fin = await callFn("completeMultipartUpload", {
    session_id: sessionId, 
    uploadId, 
    key,
    parts: [...parts].sort((a, b) => a.partNumber - b.partNumber),
    ...extra,
  }, { signal, timeoutMs: 180_000 });
  
  const url = pickUrl(fin);
  if (!url) throw new Error("CompleteMultipartUpload terminé sans URL (" + JSON.stringify(fin)?.slice(0, 120) + ")");
  
  console.log("[S3] SUCCÈS! URL finale:", url);
  onProgress?.(100);
  return url;
}

export async function uploadChunked(file, onProgress, opts = {}) {
  const onDetail = typeof onProgress === "object" ? onProgress.onDetail : opts.onDetail;
  const pctCb = typeof onProgress === "function" ? onProgress : (typeof onProgress === "object" ? onProgress.onProgress : undefined);
  const signal = (typeof onProgress === "object" ? onProgress.signal : undefined) ?? opts.signal;

  const sessionId = sessionIdOf(file);
  const chunkUrl = fnUrl("upload_chunk");

  const init = await postWithRetry(chunkUrl, JSON.stringify({ action: "init", session_id: sessionId, name: file.name, size: file.size }), { headers: { "Content-Type": "application/json" }, signal });
  if (init?.error) throw new Error(init.error);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploaded = new Set(Array.isArray(init?.uploaded) ? init.uploaded : []);

  let uploadedBytes = 0;
  for (const i of uploaded) uploadedBytes += Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
  
  const report = () => {
    pctCb?.(Math.round((uploadedBytes / file.size) * 95));
    onDetail?.({ uploadedBytes, totalBytes: file.size });
  };
  report();

  for (let i = 0; i < totalChunks; i++) {
    if (uploaded.has(i)) continue;
    const end = Math.min(file.size, (i + 1) * CHUNK_SIZE);
    const blob = file.slice(i * CHUNK_SIZE, end);
    const fd = new FormData();
    fd.append("action", "chunk");
    fd.append("session_id", sessionId);
    fd.append("index", String(i));
    fd.append("total", String(totalChunks));
    fd.append("name", file.name);
    fd.append("chunk", blob, `${sessionId}_${i}`);
    
    const res = await postWithRetry(chunkUrl, fd, { timeoutMs: Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 30_000), signal });
    if (res?.error) throw new Error(res.error);
    uploaded.add(i);
    uploadedBytes += blob.size;
    report();
  }

  pctCb?.(97);
  const fin = await postWithRetry(chunkUrl, JSON.stringify({ action: "finalize", session_id: sessionId, name: file.name }), { headers: { "Content-Type": "application/json" }, timeoutMs: Math.max(300_000, (file.size / (1024 * 1024)) * 400), signal });
  if (fin?.error) throw new Error(fin.error);
  const url = pickUrl(fin);
  if (!url) throw new Error("Upload terminé mais aucune URL reçue");
  pctCb?.(100);
  return url;
}

// Garde-fou : seul un vrai fichier (File / Blob) non vide part au serveur. Sans lui, un objet sans taille
// (ex. l'événement d'un clic) tombait dans la branche « gros fichier » et le serveur répondait
// « fileSize invalide » (photo de profil et de couverture recadrées).
export function assertUploadable(file) {
  const isBlob = Boolean(file) && typeof file === "object" && typeof file.size === "number" && typeof file.slice === "function";
  if (!isBlob) throw new Error("Aucune image à envoyer : le fichier est invalide.");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("Le fichier est vide.");
}

/**
 * Bible › Sagesse en audio : audio d'un chapitre envoyé TOUJOURS sur R2 (quelle que soit sa taille), rangé par le
 * serveur sous bible/<livre>/ (admin). Renvoie l'adresse publique.
 */
export async function envoyerAudioBible(file, { livre, chapitre, onProgress, onDetail, signal } = {}) {
  assertUploadable(file);
  if (familleFichier(file) !== "audio") throw new Error("Choisissez un fichier audio (mp3).");
  const refus = refusTaille(file);
  if (refus) throw new Error(refus);
  return uploadMultipartS3(avecExtension(file, "audio"), { onProgress, onDetail, signal, initExtra: { rangement: { livre, chapitre } } });
}

/** 1.3.35 : plafond d'une pièce jointe de message (même valeur que pb_hooks/lib/televersement.js). */
export const MAX_PIECE_JOINTE = 500 * MO;

/**
 * 1.3.35 : pièce jointe d'un message (vocal, vidéo, audio, document, tout fichier jusqu'à 500 Mo), envoyée vers
 * R2 par tout membre. Renvoie l'adresse publique, à passer à createMessage (piece_jointe.url).
 */
export async function envoyerPieceJointe(file, { onProgress, onDetail, signal } = {}) {
  assertUploadable(file);
  if (file.size > MAX_PIECE_JOINTE) {
    const err = new Error("Fichier trop volumineux (500 Mo au maximum).");
    err.status = 413;
    throw err;
  }
  return uploadMultipartS3(file, { onProgress, onDetail, signal, usage: "message" });
}

export async function uploadToBase44(file, { forceChunked = false, onProgress, onDetail, signal } = {}) {
  assertUploadable(file);
  // Mode PocketBase (forceChunked ignoré) :
  //  - vidéo (type video/* ou extension mp4, m4v, mov, webm, mkv), QUELLE QUE SOIT SA TAILLE -> R2 (admin) ;
  //  - autres fichiers : <= 15 Mo -> Fichier / FichierAdmin ; <= 100 Mo -> upload_chunk (admin) ;
  //  - au-delà de 100 Mo : audio (1 Go max) et image (200 Mo max) -> R2 (admin) ; autre type : refusé ici.
  if (IS_POCKETBASE) {
    const refus = refusTaille(file);
    if (refus) {
      const err = new Error(refus);
      err.status = 413;
      throw err;
    }
    if (isVideoFile(file)) return uploadMultipartS3(withVideoName(file), { onProgress, onDetail, signal });
    if (file.size <= SEUIL_UPLOAD_DIRECT) {
      const url = await directUpload(file);
      onProgress?.(100);
      return url;
    }
    if (file.size <= SEUIL_MULTIPART_S3) return uploadChunked(file, { onProgress, onDetail, signal });
    return uploadMultipartS3(avecExtension(file, familleFichier(file)), { onProgress, onDetail, signal });
  }

  if (!appParams.appId) throw new Error("VITE_BASE44_APP_ID est vide.");

  if (!forceChunked && file.size <= SEUIL_UPLOAD_DIRECT) {
    return directUpload(file);
  }

  const wantsS3 = forceChunked || file.size > SEUIL_MULTIPART_S3;
  if (wantsS3) {
    console.log("[upload] Tentative S3 multipart pour", file.name, file.size, "bytes");
    return await uploadMultipartS3(file, { onProgress, onDetail, signal });
  }

  return uploadChunked(file, { onProgress, onDetail, signal });
}
