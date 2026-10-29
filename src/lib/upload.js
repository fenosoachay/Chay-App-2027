import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";

const SERVER_BASE = appParams.appBaseUrl || "https://base44.app";
export const REMOTE_APP_URL = "https://chay.base44.app";

export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 Mo
export const SEUIL_UPLOAD_DIRECT = 15 * 1024 * 1024; // 15 Mo
export const SEUIL_MULTIPART_S3 = 100 * 1024 * 1024; // 100 Mo
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pickUrl = (res) => {
  if (!res) return null;
  if (typeof res === "string") return /^https?:\/\//i.test(res) ? res : null;
  const url = res.file_url || res.url || res.uri || res.data?.file_url || res.data?.url || null;
  return url && /^https?:\/\//i.test(url) ? url : null;
};

function authHeaders(extra = {}) {
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
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

const MAX_PARTS = 10_000;

async function callFn(name, payload, { signal, timeoutMs = 60_000 } = {}) {
  const res = await postWithRetry(`${SERVER_BASE}/api/functions/${name}`, JSON.stringify(payload), {
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
  const { onProgress, onDetail, signal } = cb;
  console.log("[S3] Démarrage de uploadMultipartS3 pour:", file.name, "Taille:", file.size);

  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);

  console.log("[S3] Étape 1: Appel à initMultipartUpload...");
  const init = await callFn("initMultipartUpload", {
    session_id: sessionId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "",
    lastModified: file.lastModified || 0,
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
    const st = await callFn("getPresignedUrl", { action: "status", session_id: sessionId }, { signal });
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
      partNumber: n 
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

  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
  const fnUrl = `${SERVER_BASE}/api/functions/upload_chunk`;

  const init = await postWithRetry(fnUrl, JSON.stringify({ action: "init", session_id: sessionId, name: file.name, size: file.size }), { headers: { "Content-Type": "application/json" }, signal });
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
    
    const res = await postWithRetry(fnUrl, fd, { timeoutMs: Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 30_000), signal });
    if (res?.error) throw new Error(res.error);
    uploaded.add(i);
    uploadedBytes += blob.size;
    report();
  }

  pctCb?.(97);
  const fin = await postWithRetry(fnUrl, JSON.stringify({ action: "finalize", session_id: sessionId, name: file.name }), { headers: { "Content-Type": "application/json" }, timeoutMs: Math.max(300_000, (file.size / (1024 * 1024)) * 400), signal });
  if (fin?.error) throw new Error(fin.error);
  const url = pickUrl(fin);
  if (!url) throw new Error("Upload terminé mais aucune URL reçue");
  pctCb?.(100);
  return url;
}

export async function uploadToBase44(file, { forceChunked = false, onProgress, onDetail, signal } = {}) {
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
