import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";

// ─────────────────────────────────────────────────────────────────────────────
// Upload centralisé, production-grade pour gros fichiers (MP4 multi-Go).
//
// Historique du bug : l'app appelait `Core.UploadPublicFile`, un endpoint qui
// n'existe pas côté Base44. Le module integrations du SDK est un Proxy dynamique
// qui laisse passer n'importe quel nom → la requête partait quand même vers
// l'API. Comme `appId` valait `undefined` (VITE_BASE44_APP_ID absent de
// l'environnement), l'URL devenue `/api/apps/undefined/integration-endpoints/...`
// n'était routée par le backend : le contexte d'app restait `None` côté serveur
// (d'où `{'app_id': None, 'app_owner': None}` dans l'erreur), l'upload était
// traité par le wrapper Python générique sans quota/streaming correct, et le
// buffer SSL du serveur saturait sur plusieurs Go →
//   "[BUF] malloc failure (_ssl.c:2437)" = WriteTimeout + OOM réseau.
//
// Solution en deux niveaux :
//  1. Fichiers < SEUIL_UPLOAD_DIRECT (images, audio courts…) : upload monolith
//     via l'API officielle Core.UploadFile (identique à avant, rapide).
//  2. Gros fichiers (films) : upload MORCEAUÉ + REPRENABLE — le fichier est
//     découpé en chunks de 8 Mo envoyés un par un avec retries exponentiels,
//     assemblés côté serveur par la fonction backend `upload_chunk`, puis
//     publiés via Core.UploadFile. Chaque chunk étant petit, plus jamais de
//     timeout d'écriture ni de saturation mémoire, et une coupure réseau ne
//     coûte que le chunk en cours (reprise automatique).
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_BASE = appParams.appBaseUrl || "https://base44.app";
export const REMOTE_APP_URL = "https://chay.base44.app";

/** Taille des morceaux : 8 Mo — assez gros pour la bande passante, assez petit
 *  pour finir en < 30 s même sur une connexion instable. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
/** Seuil de bascule hors upload monolithique (Core.UploadFile) : au-delà de
 *  15 Mo, le fichier est trop lourd pour une requête unique (timeouts SSL /
 *  quota serverless). Ce seuil reste celui du REPLI legacy `upload_chunk`. */
export const SEUIL_UPLOAD_DIRECT = 15 * 1024 * 1024; // 15 Mo
/** Seuil de bascule vers S3 MULTIPART DIRECT : tout fichier > 100 Mo part en
 *  multipart S3/R2 (octets navigateur → bucket, assemblage côté stockage),
 *  qu'il soit vidéo ou non. En dessous, l'upload monolith officiel suffit. */
export const SEUIL_MULTIPART_S3 = 100 * 1024 * 1024; // 100 Mo
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pickUrl = (res) => {
  if (!res) return null;
  if (typeof res === "string") return /^https?:\/\//i.test(res) ? res : null;
  const url =
    res.file_url || res.url || res.uri || res.data?.file_url || res.data?.url || null;
  return url && /^https?:\/\//i.test(url) ? url : null;
};

/** En-têtes d'authentification Base44 pris SUR CHAQUE requête (et pas figés à
 *  la construction du client) : un login/logout pendant un long upload est
 *  ainsi toujours pris en compte. */
function authHeaders(extra = {}) {
  const token = appParams.token || base44.config?.token;
  return {
    "X-App-Id": String(appParams.appId ?? ""),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** Upload monolithique officiel (petits fichiers). */
async function directUpload(file) {
  const res = await base44.integrations.Core.UploadFile({ file });
  const url = pickUrl(res);
  if (!url) {
    throw new Error(
      "Échec du téléversement : réponse d'upload inattendue (" +
        JSON.stringify(res)?.slice(0, 120) +
        ")"
    );
  }
  return url;
}

/** POST avec retry exponentiel — résiste aux coupures réseau.
 *  @param {Object} opts
 *  @param {AbortSignal} [opts.signal] - signal d'annulation utilisateur
 *        ("Annuler" dans l'UI) : coupe la requête en cours ET empêche tout
 *        nouvelle tentative (l'erreur n'est pas "retryable" → boucle stoppée).
 */
async function postWithRetry(url, body, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    try {
      // Timeout global = délai par défaut + temps consommé par les retries
      // déjà effectués (sinon un upload reprenable serait coupé au bout de
      // ~2 min alors qu'il progresse normalement).
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
      // Annulation volontaire de l'utilisateur : on remonte tout de suite.
      if (opts.signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
      const networkLevel = !err.retryable && !(err.name === "AbortError" && attempt > 0);
      if (attempt === MAX_RETRIES) break;
      if (!err.retryable && !networkLevel && err.message?.startsWith("HTTP 4")) break;
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

/** Formatage "Octets" FR pour la progression (ex: 2.3 Go / 5.1 Go). */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = n, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload S3 MULTIPART DIRECT (Cloudflare R2 / AWS S3) — mode principal pour les
// fichiers > SEUIL_UPLOAD_DIRECT.
//
// Pourquoi : le mode legacy (upload_chunk + finalize) assemble le fichier côté
// serveur → un film de 5+ Go dépasse la RAM des fonctions serverless Base44
// (128-512 Mo). Ici le serveur ne signe que des URLs (SigV4, ~1 Ko de mémoire)
// et c'est S3/R2 qui assemble l'objet côté stockage. Les octets vont du
// navigateur directement au bucket : Base44 ne voit jamais les données.
//
// Déroulé :
//   1. initMultipartUpload      → { uploadId, key, partSize, totalParts }
//   2. par chunk : getPresignedUrl → PUT blob brut vers R2 → ETag (header)
//      puis getPresignedUrl{action:'register'} pour mémoriser l'ETag serveur.
//   3. completeMultipartUpload  → { file_url } (URL publique du fichier).
//
// Reprise : après une coupure au chunk #45/100, on rappelle cette fonction avec
// le MÊME fichier : le sessionId déterministe retrouve la session, l'action
// 'status' (ListParts côté S3 = vérité terrain) renvoie les parts déjà reçues
// et seuls les chunks manquants sont retéléversés.
//
// ⚠️ Prérequis CORS sur le bucket R2 (voir docs/R2_SETUP.md) : PUT autorisé
// depuis l'origine de l'app, avec Access-Control-Expose-Headers: ETag — sinon
// fetch() ne peut pas LIRE l'ETag de la réponse (l'upload fonctionnerait mais
// la finalisation échouerait).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PARTS = 10_000; // limite S3/R2

async function callFn(name, payload, { signal, timeoutMs = 60_000 } = {}) {
  const res = await postWithRetry(`${SERVER_BASE}/api/functions/${name}`, JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    signal,
    timeoutMs,
  });
  if (res?.error) throw new Error(res.error);
  return res || {};
}

/** PUT direct d'une part vers sa presigned URL, avec retry si réseau coupé.
 *  La presigned URL expire au bout de 15 min : si elle a pu expirer entre
 *  deux tentatives, on en redemande une fraîche avant de réessayer. */
async function putPartToS3(presignedUrl, blob, { signal, freshUrl }) {
  let url = presignedUrl;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    try {
      const controller = new AbortController();
      // ~1 s/Mo + 60 s de marge ; plafonné à 10 min par tentative.
      const ms = Math.min(600_000, Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 60_000));
      const timer = setTimeout(() => controller.abort(), ms);
      const onOuterAbort = () => controller.abort();
      signal?.addEventListener("abort", onOuterAbort);
      let res;
      try {
        res = await fetch(url, {
          method: "PUT",
          body: blob,           // blob BRUT, pas de FormData, pas d'en-tête signé requis
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onOuterAbort);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`S3 HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.retryable = res.status >= 500 || res.status === 429;
        // 403 SignatureDoesNotMatch/Expired → URL périmée, on la régénère.
        if (res.status === 403 && typeof freshUrl === "function") url = await freshUrl();
        throw err;
      }
      // Exposed header "ETag" (CORS) ; retombe sur x-etag si config alternative.
      const etag = res.headers.get("etag") || res.headers.get("x-etag") || "";
      if (!etag) throw new Error("ETag absent de la réponse S3 — vérifier Access-Control-Expose-Headers sur le bucket (docs/R2_SETUP.md)");
      return etag.replace(/"/g, "");
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
      if (attempt === MAX_RETRIES) break;
      if (err.retryable === false && !/^S3 HTTP 403/.test(err.message || "")) {
        // Erreur 4xx définitive hors expiration : inutile de réessayer 6 fois.
        if (/HTTP 4(00|11|13|14)/.test(err.message || "")) break;
      }
      await sleep(Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 300);
    }
  }
  throw lastErr;
}

/**
 * Upload multipart DIRECT vers S3/R2. Retourne l'URL publique finale.
 * @param {File} file
 * @param {{onProgress?:(pct:number)=>void, onDetail?:(d:{uploadedBytes:number,totalBytes:number})=>void, signal?:AbortSignal}} cb
 */
export async function uploadMultipartS3(file, cb = {}) {
  const { onProgress, onDetail, signal } = cb;

  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);

  // 1. Ouverture / reprise de la session (CreateMultipartUpload côté serveur).
  const init = await callFn("initMultipartUpload", {
    session_id: sessionId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "",
    lastModified: file.lastModified || 0,
  }, { signal });
  if (init.already_done && init.file_url) { onProgress?.(100); return init.file_url; }
  const { uploadId, key } = init;
  if (!uploadId || !key) throw new Error("initMultipartUpload : uploadId/key absents");
  // Le serveur négocie la taille de part (8 Mo, augmentée si > 10 000 parts).
  const partSize = Math.max(Number(init.partSize) || CHUNK_SIZE, 5 * 1024 * 1024);
  const totalParts = Number(init.totalParts) || Math.ceil(file.size / partSize);
  if (totalParts > MAX_PARTS) throw new Error(`Trop de parts (${totalParts}) — fichier > 78 Go avec parts de 8 Mo`);

  // 2. Vérité terrain côté S3 : quelles parts sont déjà téléversées ?
  //    (fonctionne même après rechargement de page : ListParts est l'autorité).
  let doneSet = new Set();
  try {
    const st = await callFn("getPresignedUrl", { action: "status", session_id: sessionId }, { signal });
    if (st.done && st.file_url) { onProgress?.(100); return st.file_url; }
    for (const n of st.uploaded || []) doneSet.add(Number(n));
  } catch { /* première session vierge : rien de reçu, statut normal */ }

  let uploadedBytes = 0;
  for (const i of doneSet) {
    const start = (i - 1) * partSize;
    uploadedBytes += Math.min(partSize, file.size - start);
  }
  const report = () => {
    // 0→93 % pendant les parts, 93→99 % pendant la finalisation, 100 % à la fin.
    onProgress?.(Math.min(93, Math.round((uploadedBytes / file.size) * 93)));
    onDetail?.({ uploadedBytes, totalBytes: file.size });
  };
  report();

  // 3. Parts manquantes : URL signée → PUT direct → ETag → register serveur.
  const parts = [];
  for (let n = 1; n <= totalParts; n++) {
    if (doneSet.has(n)) continue;
    if (signal?.aborted) { const e = new Error("Upload annulé"); e.cancelled = true; throw e; }
    const start = (n - 1) * partSize;
    const blob = file.slice(start, Math.min(file.size, start + partSize));

    const signed = await callFn("getPresignedUrl", { session_id: sessionId, uploadId, key, partNumber: n }, { signal });
    const etag = await putPartToS3(signed.presignedUrl, blob, {
      signal,
      freshUrl: async () => (await callFn("getPresignedUrl", { session_id: sessionId, uploadId, key, partNumber: n }, { signal })).presignedUrl,
    });
    parts.push({ partNumber: n, etag });
    uploadedBytes += blob.size;
    report();
    // Confirmation serveur (métadonnées seules) — best-effort : la reprise
    // s'appuie sur ListParts, donc un échec ici n'est pas bloquant.
    await callFn("getPresignedUrl", { action: "register", session_id: sessionId, partNumber: n, etag }, { signal })
      .catch((e) => console.warn("[s3-upload] register échoué (non bloquant) :", e?.message));
  }

  // 4. CompleteMultipartUpload : assemblage côté stockage, zéro mémoire serveur.
  onProgress?.(95);
  const fin = await callFn("completeMultipartUpload", {
    session_id: sessionId, uploadId, key,
    parts: [...parts].sort((a, b) => a.partNumber - b.partNumber),
  }, { signal, timeoutMs: 180_000 });
  const url = pickUrl(fin);
  if (!url) throw new Error("CompleteMultipartUpload terminé sans URL (" + JSON.stringify(fin)?.slice(0, 120) + ")");
  onProgress?.(100);
  return url;
}


/**
 * Upload morcelé + reprenable pour les gros médias.
 * @param {File} file
 * @param {(pct:number)=>void} [onProgress] progression 0→100 (rétro-compatible)
 *        — ou objet de progression complet { onProgress, onDetail } voir ci-dessous.
 * @param {Object} [opts]
 * @param {(detail:{uploadedBytes:number,totalBytes:number})=>void} [opts.onDetail]
 *        callback riche : octets réellement envoyés / taille totale → l'UI en
 *        déduit %, taille "2.3 Go / 5.1 Go", vitesse et temps restant.
 * @param {AbortSignal} [opts.signal] - permet le bouton "Annuler".
 * @returns {Promise<string>} URL publique du fichier
 */
export async function uploadChunked(file, onProgress, opts = {}) {
  // Accepte aussi la forme uploadChunked(file, { onProgress, onDetail, signal }).
  const onDetail = typeof onProgress === "object" ? onProgress.onDetail : opts.onDetail;
  const pctCb = typeof onProgress === "function" ? onProgress : (typeof onProgress === "object" ? onProgress.onProgress : undefined);
  const signal = (typeof onProgress === "object" ? onProgress.signal : undefined) ?? opts.signal;

  // 1. Ouverture de la session d'upload (id déterministe = reprise auto après
  //    rechargement de page si le même fichier est sélectionné à nouveau).
  const sessionId = btoa(`${file.name}:${file.size}:${file.lastModified}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 48);

  const fnUrl = `${SERVER_BASE}/api/functions/upload_chunk`;

  const init = await postWithRetry(fnUrl, JSON.stringify({ action: "init", session_id: sessionId, name: file.name, size: file.size }), {
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (init?.error) throw new Error(init.error);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploaded = new Set(Array.isArray(init?.uploaded) ? init.uploaded : []);

  // Progression en OCTETS (plus précis que par chunk : le dernier chunk est
  // partiel, et les chunks déjà présents côté serveur sont comptés d'office).
  let uploadedBytes = 0;
  for (const i of uploaded) {
    uploadedBytes += Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
  }
  const report = () => {
    pctCb?.(Math.round((uploadedBytes / file.size) * 95));
    onDetail?.({ uploadedBytes, totalBytes: file.size });
  };
  report();

  // 2. Envoi morceau par morceau (les morceaux déjà présents côté serveur sont
  //    sautés → reprise après coupure sans renvoyer tout le fichier).
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
    // Timeout adapté à la taille du morceau (~60 s minimum, + 1 s/Mo envoyé).
    const res = await postWithRetry(fnUrl, fd, {
      timeoutMs: Math.max(60_000, (blob.size / (1024 * 1024)) * 1000 + 30_000),
      signal,
    });
    if (res?.error) throw new Error(res.error);
    uploaded.add(i);
    uploadedBytes += blob.size;
    report();
  }

  // 3. Assemblage côté serveur + publication via le stockage public officiel.
  pctCb?.(97);
  const fin = await postWithRetry(fnUrl, JSON.stringify({ action: "finalize", session_id: sessionId, name: file.name }), {
    headers: { "Content-Type": "application/json" },
    // L'assemblage télécharge puis recolle tous les morceaux : dimensionné
    // dynamiquement pour supporter des fichiers très volumineux (Go).
    timeoutMs: Math.max(300_000, (file.size / (1024 * 1024)) * 400),
    signal,
  });
  if (fin?.error) throw new Error(fin.error);
  const url = pickUrl(fin);
  if (!url) throw new Error("Upload terminé mais aucune URL reçue (" + JSON.stringify(fin)?.slice(0, 120) + ")");
  pctCb?.(100);
  return url;
}

/** Point d'entrée unique utilisé par toute l'app. Routage :
 *   - forceChunked === true (vidéos, reprise après coupure) → S3 MULTIPART
 *     DIRECT obligatoire (initMultipartUpload / getPresignedUrl /
 *     completeMultipartUpload). L'ancien mode `upload_chunk` (assemblage côté
 *     serveur) ne sert plus que de REPLI si le backend S3 n'est pas configuré.
 *   - fichier > SEUIL_MULTIPART_S3 (100 Mo) → S3 multipart direct aussi, même
 *     sans flag (gros fichiers audio, ZIP, etc.).
 *   - fichier ≤ 100 Mo et entre 15-100 Mo → repli legacy chunked ; < 15 Mo →
 *     upload monolith officiel Core.UploadFile (images, courtes vignettes…).
 *  L'annulation utilisateur (signal) n'est JAMAIS re-tentée en mode legacy. */
export async function uploadToBase44(file, { forceChunked = false, onProgress, onDetail, signal } = {}) {
  if (!appParams.appId) {
    throw new Error("VITE_BASE44_APP_ID est vide. Configure-le dans .env ou via base44 link.");
  }

  // Petits fichiers : upload direct
  if (!forceChunked && file.size <= SEUIL_UPLOAD_DIRECT) {
    return directUpload(file);
  }

  // Gros fichiers : S3 multipart UNIQUEMENT (pas de repli)
  const wantsS3 = forceChunked || file.size > SEUIL_MULTIPART_S3;
  if (wantsS3) {
    return await uploadMultipartS3(file, { onProgress, onDetail, signal });
  }

  // Fichiers moyens (15-100 Mo) : ancien système chunked
  return uploadChunked(file, { onProgress, onDetail, signal });
}